import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

let jwtSecret: string | null = null;

export function initAuth(secret: string) {
  jwtSecret = secret;
}

export function isAuthReady(): boolean {
  return jwtSecret !== null;
}

export function authenticateHTTP(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!jwtSecret) {
    res.status(503).json({ error: "Server not configured yet" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function authenticateWS(token: string): boolean {
  if (!jwtSecret) return false;
  try {
    jwt.verify(token, jwtSecret);
    return true;
  } catch {
    return false;
  }
}

export function generateToken(): string {
  if (!jwtSecret) throw new Error("Auth not initialized");
  return jwt.sign({ auth: true }, jwtSecret, { expiresIn: "24h" });
}
