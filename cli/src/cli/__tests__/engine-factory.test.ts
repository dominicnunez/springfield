import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../config/loader.js";
import { ClaudeEngine } from "../../engines/claude.js";
import { CodexEngine } from "../../engines/codex.js";
import { OpenCodeEngine } from "../../engines/opencode.js";
import {
  createRalphEngine,
  createWillieEngine,
  getEngineInstallName,
} from "../engine-factory.js";

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    engine: "opencode",
    claudeModel: "sonnet",
    claudeEffort: "high",
    codexModel: "gpt-5-codex",
    ocPrimeModel: "big-pickle",
    ocFallModel: "fallback-model",
    softLimitRetries: 3,
    softLimitWait: 30,
    maxIterations: 10,
    sleepSeconds: 2,
    skipCommit: false,
    pushAfterCommit: false,
    skipTestVerify: false,
    maxConsecutiveFailures: 3,
    testCmd: undefined,
    ralphModel: "unused-for-codex-and-opencode",
    ralphEffort: "low",
    willieMaxIterations: 0,
    willieAuditPrompt: undefined,
    willieModel: "willie-model",
    willieEffort: "medium",
    lintCmd: undefined,
    logDir: join(homedir(), ".sfk", "logs"),
    progressDir: join(homedir(), ".sfk", "progress"),
    auditAfterComplete: false,
    ...overrides,
  };
}

describe("engine factory", () => {
  test("creates Ralph Claude engine with Ralph effort", () => {
    const engine = createRalphEngine(
      baseConfig({
        engine: "claude",
        claudeModel: "opus",
        ralphEffort: "low",
      }),
    );

    expect(engine).toBeInstanceOf(ClaudeEngine);
    expect(engine.model).toBe("opus");
    expect((engine as ClaudeEngine).effort).toBe("low");
  });

  test("creates Willie Claude engine with Willie model and effort", () => {
    const engine = createWillieEngine(
      baseConfig({
        engine: "claude",
        claudeModel: "sonnet",
        willieModel: "opus",
        willieEffort: "medium",
      }),
    );

    expect(engine).toBeInstanceOf(ClaudeEngine);
    expect(engine.model).toBe("opus");
    expect((engine as ClaudeEngine).effort).toBe("medium");
  });

  test("creates Willie Codex engine without explicit model for default", () => {
    const engine = createWillieEngine(
      baseConfig({
        engine: "codex",
        codexModel: undefined,
        willieModel: undefined,
      }),
    );

    expect(engine).toBeInstanceOf(CodexEngine);
    expect(engine.model).toBe("default");
  });

  test("creates OpenCode engines with fallback wiring intact", () => {
    const ralphEngine = createRalphEngine(
      baseConfig({
        engine: "opencode",
        ocPrimeModel: "primary",
        ocFallModel: "fallback",
      }),
    );
    const willieEngine = createWillieEngine(
      baseConfig({
        engine: "opencode",
        ocPrimeModel: "primary",
        ocFallModel: "fallback",
        willieModel: "audit-model",
      }),
    );

    expect(ralphEngine).toBeInstanceOf(OpenCodeEngine);
    expect(ralphEngine.model).toBe("primary");
    expect(willieEngine).toBeInstanceOf(OpenCodeEngine);
    expect(willieEngine.model).toBe("audit-model");
    expect((willieEngine as OpenCodeEngine).switchToFallback()).toBe(true);
  });

  test("returns shared install names", () => {
    expect(getEngineInstallName("claude")).toBe("Claude CLI");
    expect(getEngineInstallName("codex")).toBe("Codex CLI");
    expect(getEngineInstallName("opencode")).toBe("OpenCode CLI");
  });
});
