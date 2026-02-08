import { Router, Request, Response } from "express";
import { generateToken, initAuth } from "../auth.js";
import { loadRuntime, saveRuntime, hashPassword, generateSalt, generateJwtSecret } from "../config.js";
import { createLogger } from "../logger.js";

const log = createLogger("auth");

export function createAuthRouter(): Router {
  const router = Router();

  // Check if password has been set up
  router.get("/status", (_req: Request, res: Response) => {
    const runtime = loadRuntime();
    res.json({ needsSetup: runtime === null });
  });

  // First-time password setup
  router.post("/setup", (req: Request, res: Response) => {
    const existing = loadRuntime();
    if (existing) {
      res.status(400).json({ error: "Password already configured" });
      return;
    }

    const { password } = req.body;
    if (!password || typeof password !== "string" || password.length < 4) {
      res.status(400).json({ error: "Password must be at least 4 characters" });
      return;
    }

    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const jwtSecret = generateJwtSecret();

    saveRuntime({ passwordHash, salt, jwtSecret });
    initAuth(jwtSecret);

    const token = generateToken();
    log.info("Initial password setup complete", { ip: req.ip });
    res.json({ token });
  });

  // Login
  router.post("/", (req: Request, res: Response) => {
    const runtime = loadRuntime();
    if (!runtime) {
      res.status(503).json({ error: "Password not configured yet" });
      return;
    }

    const { password } = req.body;
    if (!password) {
      res.status(401).json({ error: "Invalid password" });
      return;
    }

    const hash = hashPassword(password, runtime.salt);
    if (hash !== runtime.passwordHash) {
      log.warn("Login failed: invalid password", { ip: req.ip });
      res.status(401).json({ error: "Invalid password" });
      return;
    }

    const token = generateToken();
    log.info("Login successful", { ip: req.ip });
    res.json({ token });
  });

  return router;
}
