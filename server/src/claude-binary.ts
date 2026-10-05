import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { createRequire } from "module";

const SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";

/** musl-based Linux (Alpine and similar), detected the way the SDK detects it. */
function isMuslLinux(): boolean {
  if (process.platform !== "linux") return false;
  const report =
    typeof process.report?.getReport === "function"
      ? (process.report.getReport() as { header?: { glibcVersionRuntime?: string } })
      : null;
  return report != null && report.header?.glibcVersionRuntime === undefined;
}

/**
 * Path of the Claude Code binary that the Agent SDK runs.
 *
 * Since SDK 0.2.113 the SDK ships Claude Code as a native binary in a
 * per-platform optional dependency, @anthropic-ai/claude-agent-sdk-<platform>-<arch>
 * (with a -musl variant on Linux). This looks it up the same way the SDK does,
 * so a missing binary is reported when the server starts rather than on the
 * first message. Throws if the SDK or the binary for this platform is missing.
 */
export function findBundledClaudeBinary(): string {
  const require = createRequire(import.meta.url);
  const sdkEntry = require.resolve(SDK_PACKAGE);
  const fromSdk = createRequire(sdkEntry);

  const { platform, arch } = process;
  const exe = platform === "win32" ? ".exe" : "";
  let packages: string[];
  if (platform === "linux") {
    const glibc = `${SDK_PACKAGE}-linux-${arch}`;
    const musl = `${SDK_PACKAGE}-linux-${arch}-musl`;
    packages = isMuslLinux() ? [musl, glibc] : [glibc, musl];
  } else {
    packages = [`${SDK_PACKAGE}-${platform}-${arch}`];
  }

  for (const pkg of packages) {
    try {
      const binary = fromSdk.resolve(`${pkg}/claude${exe}`);
      if (existsSync(binary)) return binary;
    } catch {
      // Not installed; try the next candidate.
    }
  }
  throw new Error(`no Claude Code binary for ${platform}-${arch} (looked for ${packages.join(", ")})`);
}

/** Output of `claude --version`, e.g. "2.1.289 (Claude Code)". */
export function claudeVersion(binary: string): string {
  return execFileSync(binary, ["--version"], { stdio: "pipe", timeout: 30_000 })
    .toString()
    .trim();
}
