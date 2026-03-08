import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../config/loader.js";
import { applyEngineModelSelection } from "../model-overrides.js";

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    engine: "opencode",
    claudeModel: "sonnet",
    claudeEffort: "high",
    codexModel: "gpt-5-codex",
    ocPrimeModel: "big-pickle",
    ocFallModel: undefined,
    softLimitRetries: 3,
    softLimitWait: 30,
    maxIterations: 10,
    sleepSeconds: 2,
    skipCommit: false,
    pushAfterCommit: false,
    skipTestVerify: false,
    maxConsecutiveFailures: 3,
    testCmd: undefined,
    ralphModel: undefined,
    ralphEffort: undefined,
    willieMaxIterations: 0,
    willieAuditPrompt: undefined,
    willieModel: "opus",
    willieEffort: undefined,
    lintCmd: undefined,
    logDir: join(homedir(), ".sfk", "logs"),
    progressDir: join(homedir(), ".sfk", "progress"),
    auditAfterComplete: false,
    ...overrides,
  };
}

describe("applyEngineModelSelection", () => {
  test("routes model override to claude model", () => {
    const resolved = applyEngineModelSelection(baseConfig(), {
      engine: "claude",
      model: "opus",
    });

    expect(resolved.engine).toBe("claude");
    expect(resolved.claudeModel).toBe("opus");
    expect(resolved.codexModel).toBe("gpt-5-codex");
    expect(resolved.ocPrimeModel).toBe("big-pickle");
  });

  test("routes model override to codex model", () => {
    const resolved = applyEngineModelSelection(baseConfig(), {
      engine: "codex",
      model: "gpt-5.3-codex",
    });

    expect(resolved.engine).toBe("codex");
    expect(resolved.codexModel).toBe("gpt-5.3-codex");
  });

  test("routes model override to opencode when engine remains opencode", () => {
    const resolved = applyEngineModelSelection(baseConfig(), {
      model: "o3",
    });

    expect(resolved.engine).toBe("opencode");
    expect(resolved.ocPrimeModel).toBe("o3");
  });

  test("returns a copy unchanged when model override is undefined", () => {
    const config = baseConfig({ engine: "codex" });
    const resolved = applyEngineModelSelection(config, {});

    expect(resolved).not.toBe(config);
    expect(resolved).toEqual(config);
  });
});
