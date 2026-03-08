import { spawnSync } from "node:child_process";
import { logWarning } from "../ui/logger.js";

export function runGitStdout(args: readonly string[]): string | null {
  const result = spawnSync("git", [...args], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

export function runGitLines(
  args: readonly string[],
  warningLabel: string,
): string[] {
  const result = spawnSync("git", [...args], {
    encoding: "utf-8",
    cwd: process.cwd(),
  });

  if (result.error) {
    logWarning(`${warningLabel} failed: ${result.error.message}`);
    return [];
  }

  if (result.status !== 0 || !result.stdout) {
    return [];
  }

  return result.stdout.split("\n").filter(Boolean);
}
