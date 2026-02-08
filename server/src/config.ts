import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomBytes, scryptSync } from "crypto";

const STORAGE_DIR = join(homedir(), ".claude-code-remote");
const RUNTIME_PATH = join(STORAGE_DIR, "runtime.json");

export interface RuntimeConfig {
  passwordHash: string;
  salt: string;
  jwtSecret: string;
}

export function loadRuntime(): RuntimeConfig | null {
  if (!existsSync(RUNTIME_PATH)) return null;
  try {
    const raw = readFileSync(RUNTIME_PATH, "utf-8");
    const data = JSON.parse(raw) as RuntimeConfig;
    if (!data.passwordHash || !data.salt || !data.jwtSecret) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveRuntime(config: RuntimeConfig): void {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
  writeFileSync(RUNTIME_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function generateSalt(): string {
  return randomBytes(32).toString("hex");
}

export function generateJwtSecret(): string {
  return randomBytes(48).toString("hex");
}

export function getPort(): number {
  return parseInt(process.env.PORT || "3001", 10);
}
