import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { authenticator } from "otplib";
import { loginRateLimit, trackDevice, trackLocation } from "./middleware/security";
import { 
  sendEmailVerification, 
  sendSmsVerification,
  verifyCode,
  verifyTotp 
} from "./utils/verification";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

async function logAuthAction(userId: number, action: string, status: string, req: Express.Request) {
  const device = req.device;

  await storage.addAuthHistory({
    userId,
    action,
    status,
    deviceId: device?.id,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"] || "",
    location: req.geoLocation,
    timestamp: new Date(),
  });

  if (status === "SUCCESS") {
    await storage.updateUser(userId, {
      lastLogin: new Date(),
    });
  }
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "default-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(trackLocation);

  // Clean expired sessions periodically
  setInterval(() => {
    storage.cleanExpiredSessions();
  }, 60 * 60 * 1000); // Every hour

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Invalid credentials" });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await hashPassword(req.body.password);
      const totpSecret = authenticator.generateSecret();

      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
        totpSecret,
      });

      await logAuthAction(user.id, "REGISTER", "SUCCESS", req);

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", loginRateLimit, (req, res, next) => {
    passport.authenticate("local", async (err, user) => {
      if (err) return next(err);
      if (!user) {
        await logAuthAction(
          user?.id || 0, // Handle potential null user
          "LOGIN",
          "FAILED",
          req
        );
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check for suspicious location
      if (req.geoLocation) {
        const recentLogins = await storage.getLoginAttempts(user.id, 24 * 60); // Last 24 hours
        const unusualLocation = !recentLogins.some(login => 
          login.location?.country === req.geoLocation?.country
        );

        if (unusualLocation) {
          await sendEmailVerification(user);
          return res.status(403).json({ 
            message: "Login from new location detected. Please check your email for verification.",
            requiresLocationVerification: true
          });
        }
      }

      await logAuthAction(user.id, "LOGIN", "SUCCESS", req);

      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", trackDevice, async (req, res, next) => {
    if (req.user) {
      const userId = (req.user as SelectUser).id;
      await logAuthAction(userId, "LOGOUT", "SUCCESS", req);
    }

    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", trackDevice, (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}
