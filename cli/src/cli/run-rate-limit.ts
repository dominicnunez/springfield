import type { Config } from "../config/loader.js";
import type { Engine, EngineResult } from "../engines/base.js";
import { handleSoftRateLimit as handleSoftRateLimitRetry } from "../engines/rate-limit.js";
import { logError, logWarning } from "../ui/logger.js";
import { switchToFallbackWithNotice } from "./engine-fallback.js";

export interface RunRateLimitResolution {
  action: "continue" | "retry" | "fallback" | "exit";
  softLimitRetries: number;
}

export type SoftRateLimitRetryFn = (
  retries: number,
  maxRetries: number,
  waitSeconds: number,
) => Promise<boolean>;

export async function resolveRunRateLimitAction(
  engine: Engine,
  result: Pick<EngineResult, "hardRateLimited" | "softRateLimited">,
  softLimitRetries: number,
  config: Config,
  retrySoftRateLimit: SoftRateLimitRetryFn = handleSoftRateLimitRetry,
): Promise<RunRateLimitResolution> {
  if (!result.hardRateLimited && !result.softRateLimited) {
    return { action: "continue", softLimitRetries: 0 };
  }

  if (result.hardRateLimited) {
    logWarning("Hard rate limit detected (quota/billing)");
    console.log("  Hard rate limit: quota or billing issue");

    if (switchToFallbackWithNotice(engine)) {
      return { action: "fallback", softLimitRetries: 0 };
    }

    logError("Hard rate limit and no fallback available");
    console.log("  Hard rate limit and no fallback available");
    return { action: "exit", softLimitRetries: 0 };
  }

  logWarning("Soft rate limit detected (temporary cooldown)");

  if (
    await retrySoftRateLimit(
      softLimitRetries,
      config.softLimitRetries,
      config.softLimitWait,
    )
  ) {
    return {
      action: "retry",
      softLimitRetries: softLimitRetries + 1,
    };
  }

  if (switchToFallbackWithNotice(engine)) {
    return { action: "fallback", softLimitRetries: 0 };
  }

  logError("Soft rate limit persisted, no fallback available");
  console.log("  Rate limit persisted after retries, no fallback available");
  return { action: "exit", softLimitRetries: 0 };
}
