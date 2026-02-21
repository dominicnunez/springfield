import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { logWarning } from "../ui/logger.js";
import type { Engine, EngineResult } from "./base.js";

// Hard rate limit patterns: quota exhausted, billing issues - won't recover with waiting
const HARD_RATE_LIMIT_PATTERNS = [
  /insufficient_quota/i,
  /insufficient.balance/i,
  /exceeded.*(usage.tier|current.quota)/i,
  /billing.details/i,
  /not.?included.?in.?(your|plan)/i,
];

// Soft rate limit patterns: temporary cooldowns - may recover after waiting
const SOFT_RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /statusCode.*429/i,
  /too.?many.?request/i,
  /per.?minute/i,
  /tokens.per.minute/i,
  /over.?capacity/i,
  /at.?capacity/i,
  /retry.?after/i,
];

export class OpenCodeEngine implements Engine {
  name = "opencode";
  model: string;

  private primaryModel: string;
  private fallbackModel: string | undefined;
  private usingFallback = false;

  constructor(model: string = "big-pickle", fallbackModel?: string) {
    this.primaryModel = model;
    this.model = model;
    this.fallbackModel = fallbackModel;
  }

  isAvailable(): boolean {
    const { spawnSync } = require("node:child_process");
    const result = spawnSync("which", ["opencode"], { encoding: "utf-8" });
    return result.status === 0;
  }

  async run(prompt: string): Promise<EngineResult> {
    const args = ["run", "--model", this.model, prompt];

    return new Promise<EngineResult>((resolve) => {
      const child = spawn("opencode", args, {
        cwd: process.cwd(),
        stdio: ["inherit", "pipe", "pipe"],
      });

      let output = "";
      let stderr = "";
      let killed = false;

      const killChild = () => {
        if (!killed) {
          killed = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {}
          }, 5000);
        }
      };

      if (!child.stdout) {
        resolve({
          success: false,
          output: "Failed to spawn opencode: no stdout",
          exitCode: 1,
          rateLimited: false,
        });
        return;
      }

      const rl = createInterface({ input: child.stdout });

      rl.on("line", (line) => {
        process.stdout.write(`${line}\n`);
        output += `${line}\n`;
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(text);
      });

      child.on("close", (code) => {
        rl.close();

        const combined = output + stderr;
        const hardRateLimited = this.isHardRateLimited(combined);
        const softRateLimited =
          !hardRateLimited && this.isSoftRateLimited(combined);
        const rateLimited = hardRateLimited || softRateLimited;

        resolve({
          success: code === 0,
          output: output || stderr,
          exitCode: code ?? 1,
          rateLimited,
          hardRateLimited,
          softRateLimited,
        });
      });

      const safetyTimeout = setTimeout(
        () => {
          process.stderr.write(
            "\n[sfk] Safety timeout reached (45 min), killing OpenCode process\n",
          );
          killChild();
        },
        45 * 60 * 1000,
      );

      child.on("close", () => {
        clearTimeout(safetyTimeout);
      });
    });
  }

  /**
   * Check if output indicates hard rate limiting (quota/billing - immediate fallback)
   */
  private isHardRateLimited(output: string): boolean {
    return HARD_RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(output));
  }

  /**
   * Check if output indicates soft rate limiting (temporary - retry first)
   */
  private isSoftRateLimited(output: string): boolean {
    return SOFT_RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(output));
  }

  /**
   * Switch to fallback model
   */
  switchToFallback(): boolean {
    if (this.fallbackModel && !this.usingFallback) {
      logWarning(
        `Rate limit on ${this.model}, switching to fallback: ${this.fallbackModel}`,
      );
      console.log("");
      console.log("===========================================");
      console.log(`  Rate limit detected on ${this.model}`);
      console.log(`  Switching to fallback: ${this.fallbackModel}`);
      console.log("===========================================");
      console.log("");

      this.model = this.fallbackModel;
      this.usingFallback = true;
      return true;
    }
    return false;
  }

  /**
   * Reset to primary model
   */
  resetToPrimary(): void {
    this.model = this.primaryModel;
    this.usingFallback = false;
  }

  /**
   * Check if currently using fallback
   */
  isUsingFallback(): boolean {
    return this.usingFallback;
  }
}
