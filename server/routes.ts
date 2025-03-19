import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { authenticator } from "otplib";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Verification endpoints
  app.post("/api/verify/email", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // In a real app, send verification email here
    // For demo, auto-verify
    const user = req.user!;
    await storage.updateUser(user.id, {
      ...user,
      verificationStep: 2,
    });
    res.json({ success: true });
  });

  app.post("/api/verify/phone", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // In a real app, send SMS verification here
    // For demo, auto-verify
    const user = req.user!;
    await storage.updateUser(user.id, {
      ...user,
      verificationStep: 3,
    });
    res.json({ success: true });
  });

  app.post("/api/verify/security-questions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user!;
    const { answers } = req.body;

    const storedQuestions = user.securityQuestions;
    if (!storedQuestions) {
      return res.status(400).json({ message: "Security questions not set" });
    }

    const isCorrect = 
      answers.answer1.toLowerCase() === storedQuestions.answer1.toLowerCase() &&
      answers.answer2.toLowerCase() === storedQuestions.answer2.toLowerCase() &&
      answers.answer3.toLowerCase() === storedQuestions.answer3.toLowerCase();

    if (!isCorrect) {
      return res.status(400).json({ message: "Incorrect answers" });
    }

    await storage.updateUser(user.id, {
      ...user,
      verificationStep: 4,
    });

    res.json({ success: true });
  });

  app.post("/api/verify/totp", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const user = req.user!;
    const { token } = req.body;

    if (!user.totpSecret) {
      return res.status(400).json({ message: "TOTP not set up" });
    }

    const isValid = authenticator.verify({
      token,
      secret: user.totpSecret,
    });

    if (!isValid) {
      return res.status(400).json({ message: "Invalid TOTP token" });
    }

    await storage.updateUser(user.id, {
      ...user,
      verificationStep: 5,
      isVerified: true,
    });

    res.json({ success: true });
  });

  // Auth history
  app.get("/api/auth-history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const history = await storage.getAuthHistory(req.user!.id);
    res.json(history);
  });

  // Sessions
  app.get("/api/sessions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const sessions = await storage.getSessions(req.user!.id);
    res.json(sessions);
  });

  app.delete("/api/sessions/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.deleteSession(parseInt(req.params.id));
    res.sendStatus(200);
  });

  const httpServer = createServer(app);
  return httpServer;
}
