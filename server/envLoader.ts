import fs from "fs";
import path from "path";
import dotenv from "dotenv";

/**
 * Loads Localhost environment files in precedence order without ever overriding
 * existing system/platform environment variables (Netlify CI / Container / Shell env wins):
 *   1. `.env.local` (local developer secrets & overrides, gitignored)
 *   2. `.env` (optional non-secret defaults)
 */
export function loadServerEnvironment(cwd: string = process.cwd()): void {
  const envLocalPath = path.resolve(cwd, ".env.local");
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath, override: false });
  }
  const envPath = path.resolve(cwd, ".env");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}
