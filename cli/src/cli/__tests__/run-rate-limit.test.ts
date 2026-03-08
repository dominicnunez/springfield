import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { Config } from "../../config/loader.js";
import type { Engine } from "../../engines/base.js";
import { resolveRunRateLimitAction } from "../run-rate-limit.js";

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    engine: "opencode",
    maxIterations: 10,
    sleepSeconds: 1,
    skipCommit: false,
    pushAfterCommit: false,
    claudeModel: "sonnet",
    claudeEffort: "high",
    codexModel: "gpt-5-codex",
    ocPrimeModel: "prime-model",
    ocFallModel: "fallback-model",
    softLimitRetries: 3,
    softLimitWait: 30,
    testCmd: undefined,
    skipTestVerify: false,
    maxConsecutiveFailures: 3,
    ralphModel: undefined,
    ralphEffort: undefined,
    willieMaxIterations: 0,
    willieAuditPrompt: undefined,
    willieModel: undefined,
    willieEffort: undefined,
    lintCmd: undefined,
    logDir: "/tmp/logs",
    progressDir: "/tmp/progress",
    auditAfterComplete: false,
    ...overrides,
  };
}

function stubEngine(canFallback = false): Engine {
  return {
    name: "opencode",
    model: "prime-model",
    isAvailable: () => true,
    run: async () => ({
      success: true,
      output: "",
      exitCode: 0,
    }),
    switchToFallback: () => canFallback,
  };
}

describe("run rate limit helper", () => {
  let consoleLogSpy:
    | ReturnType<typeof spyOn<typeof console, "log">>
    | undefined;

  afterEach(() => {
    consoleLogSpy?.mockRestore();
  });

  test("returns continue when result is not rate limited", async () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});

    const resolution = await resolveRunRateLimitAction(
      stubEngine(),
      { hardRateLimited: false, softRateLimited: false },
      2,
      baseConfig(),
    );

    expect(resolution).toEqual({
      action: "continue",
      softLimitRetries: 0,
    });
  });

  test("returns fallback for hard rate limits when fallback is available", async () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});

    const resolution = await resolveRunRateLimitAction(
      stubEngine(true),
      { hardRateLimited: true, softRateLimited: false },
      1,
      baseConfig(),
    );

    expect(resolution).toEqual({
      action: "fallback",
      softLimitRetries: 0,
    });
  });

  test("returns retry for soft rate limits when cooldown succeeds", async () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});

    const resolution = await resolveRunRateLimitAction(
      stubEngine(),
      { hardRateLimited: false, softRateLimited: true },
      1,
      baseConfig(),
      async () => true,
    );

    expect(resolution).toEqual({
      action: "retry",
      softLimitRetries: 2,
    });
  });

  test("returns exit when soft rate limits persist without fallback", async () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});

    const resolution = await resolveRunRateLimitAction(
      stubEngine(false),
      { hardRateLimited: false, softRateLimited: true },
      1,
      baseConfig(),
      async () => false,
    );

    expect(resolution).toEqual({
      action: "exit",
      softLimitRetries: 0,
    });
  });
});
