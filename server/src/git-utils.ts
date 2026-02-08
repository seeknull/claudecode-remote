import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { devNull } from "os";

export interface GitFileStatus {
  file: string;
  status: string; // "M" | "A" | "D" | "??" | "R" | etc.
}

export interface GitInfo {
  isRepo: boolean;
  branch: string;
  files: GitFileStatus[];
}

function git(dir: string, args: string): string {
  return execSync(`git ${args}`, {
    cwd: dir,
    encoding: "utf-8",
    timeout: 10000,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function isGitRepo(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}

export function getGitInfo(dir: string): GitInfo {
  if (!isGitRepo(dir)) {
    return { isRepo: false, branch: "", files: [] };
  }

  let branch = "";
  try {
    branch = git(dir, "rev-parse --abbrev-ref HEAD");
  } catch {
    branch = "unknown";
  }

  const files: GitFileStatus[] = [];
  try {
    const output = git(dir, "status --porcelain");
    if (output) {
      for (const line of output.split("\n")) {
        if (!line) continue;
        const status = line.slice(0, 2).trim();
        const file = line.slice(3);
        files.push({ status, file });
      }
    }
  } catch {
    // ignore
  }

  return { isRepo: true, branch, files };
}

export function getGitDiff(dir: string, file?: string): string {
  if (!isGitRepo(dir)) return "";

  // If a specific file is requested, check if it's untracked
  if (file) {
    try {
      const status = git(dir, `status --porcelain -- "${file}"`);
      if (status.startsWith("??")) {
        // Untracked file — git diff --no-index exits with code 1 when there are diffs
        try {
          return execSync(`git diff --no-index "${devNull}" "${file}"`, {
            cwd: dir,
            encoding: "utf-8",
            timeout: 10000,
            stdio: ["pipe", "pipe", "pipe"],
          }).trim();
        } catch (err: any) {
          // Exit code 1 means differences found — stdout has the diff
          if (err.stdout) return (err.stdout as string).trim();
          return "";
        }
      }
    } catch {
      // Fall through to normal diff
    }
  }

  try {
    // Show both staged and unstaged changes
    const args = file
      ? `diff HEAD -- "${file}"`
      : "diff HEAD";
    return git(dir, args);
  } catch {
    // If HEAD doesn't exist (new repo), try diff without HEAD
    try {
      const args = file
        ? `diff -- "${file}"`
        : "diff";
      return git(dir, args);
    } catch {
      return "";
    }
  }
}
