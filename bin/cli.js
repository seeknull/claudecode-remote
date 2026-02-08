#!/usr/bin/env node

import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
await import(join(__dirname, "..", "server", "dist", "index.js"));
