import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import type { UAParser } from "ua-parser-js";
import geoip from "geoip-lite";
import { storage } from "../storage";

// Rate limiting middleware
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { message: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Device tracking middleware
export async function trackDevice(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return next();

  const UAParser = require('ua-parser-js');
  const ua = new UAParser(req.headers["user-agent"]);
  const fingerprint = generateDeviceFingerprint(req);

  let device = await storage.getDeviceByFingerprint(req.user.id, fingerprint);

  if (!device) {
    const browserInfo = {
      browser: ua.getBrowser().name || "Unknown",
      version: ua.getBrowser().version || "Unknown",
      os: ua.getOS().name || "Unknown",
    };

    device = await storage.createDevice({
      userId: req.user.id,
      fingerprint,
      browserInfo,
      name: `${browserInfo.browser} on ${browserInfo.os}`,
      trusted: false,
    });
  } else {
    await storage.updateDeviceLastUsed(device.id);
  }

  req.device = device;
  next();
}

// Location tracking middleware
export function trackLocation(req: Request, res: Response, next: NextFunction) {
  const ip = (req.ip || "").replace('::ffff:', ''); // Handle IPv6 format
  const geo = geoip.lookup(ip);

  if (geo) {
    req.geoLocation = {
      country: geo.country,
      city: geo.city,
      latitude: geo.ll[0],
      longitude: geo.ll[1],
    };
  }

  next();
}

// Helper function to generate device fingerprint
function generateDeviceFingerprint(req: Request): string {
  const ua = req.headers["user-agent"] || "";
  const ip = req.ip || "";
  return Buffer.from(`${ua}${ip}`).toString("base64");
}

// Type augmentation for Express
declare global {
  namespace Express {
    interface Request {
      device?: import("@shared/schema").Device;
      geoLocation?: {
        country?: string;
        city?: string;
        latitude?: number;
        longitude?: number;
      };
    }
  }
}
