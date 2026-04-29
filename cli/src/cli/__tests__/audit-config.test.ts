import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../config/loader.js";
import { resolveAuditConfig } from "../audit-config.js";

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
    williePushAfterFix: false,
    lintCmd: undefined,
    logDir: join(homedir(), ".sfk", "logs"),
    progressDir: join(homedir(), ".sfk", "progress"),
    auditAfterComplete: false,
    ...overrides,
  };
}

describe("resolveAuditConfig", () => {
  test("routes --model to codex model when --engine codex is used", () => {
    const config = baseConfig({ engine: "claude" });
    const resolved = resolveAuditConfig(config, {
      engine: "codex",
      model: "gpt-5.3-codex",
    });

    expect(resolved.engine).toBe("codex");
    expect(resolved.codexModel).toBe("gpt-5.3-codex");
    expect(resolved.willieModel).toBe("opus");
  });

  test("keeps codex model from config when engine is codex and no --model", () => {
    const config = baseConfig({
      engine: "codex",
      codexModel: "gpt-5-codex",
      willieModel: "opus",
    });
    const resolved = resolveAuditConfig(config, {});

    expect(resolved.engine).toBe("codex");
    expect(resolved.codexModel).toBe("gpt-5-codex");
  });

  test("routes --model to opencode when engine is opencode", () => {
    const config = baseConfig({ engine: "opencode" });
    const resolved = resolveAuditConfig(config, { model: "o3" });

    expect(resolved.ocPrimeModel).toBe("o3");
    expect(resolved.claudeModel).toBe("sonnet");
    expect(resolved.codexModel).toBe("gpt-5-codex");
  });
});
