import { spawnSync } from "node:child_process";
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
    const result = spawnSync("which", ["opencode"], { encoding: "utf-8" });
    return result.status === 0;
  }

  async run(prompt: string): Promise<EngineResult> {
    const args = ["run", "--model", this.model, prompt];

    const result = spawnSync("opencode", args, {
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: ["inherit", "pipe", "pipe"],
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });

    const output = (result.stdout || "") + (result.stderr || "");

    // Stream output to console
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    // Check for rate limiting (hard vs soft)
    const hardRateLimited = this.isHardRateLimited(output);
    const softRateLimited = !hardRateLimited && this.isSoftRateLimited(output);
    const rateLimited = hardRateLimited || softRateLimited;

    return {
      success: result.status === 0,
      output,
      exitCode: result.status ?? 1,
      rateLimited,
      hardRateLimited,
      softRateLimited,
    };
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
