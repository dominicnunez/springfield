import { describe, expect, spyOn, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../config/loader.js";
import type { Engine } from "../../engines/base.js";
import { ClaudeEngine } from "../../engines/claude.js";
import { CodexEngine } from "../../engines/codex.js";
import { OpenCodeEngine } from "../../engines/opencode.js";
import * as logger from "../../ui/logger.js";
import {
  createRalphEngine,
  createWillieEngine,
  getEngineInstallName,
  initializeRalphEngine,
  initializeWillieEngine,
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
    williePushAfterFix: false,
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

  test("creates Willie Codex engine with configured model", () => {
    const engine = createWillieEngine(
      baseConfig({
        engine: "codex",
        codexModel: "gpt-5-codex",
        willieModel: undefined,
      }),
    );

    expect(engine).toBeInstanceOf(CodexEngine);
    expect(engine.model).toBe("gpt-5-codex");
    expect((engine as unknown as { effort: string }).effort).toBe("medium");
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
    expect((ralphEngine as unknown as { effort: string }).effort).toBe("low");
    expect(willieEngine).toBeInstanceOf(OpenCodeEngine);
    expect(willieEngine.model).toBe("audit-model");
    expect((willieEngine as unknown as { effort: string }).effort).toBe(
      "medium",
    );
    expect((willieEngine as OpenCodeEngine).switchToFallback()).toBe(true);
  });

  test("returns shared install names", () => {
    expect(getEngineInstallName("claude")).toBe("Claude CLI");
    expect(getEngineInstallName("codex")).toBe("Codex CLI");
    expect(getEngineInstallName("opencode")).toBe("OpenCode CLI");
  });

  test("initializeWillieEngine returns the engine when available", () => {
    const engine: Engine = {
      name: "stub",
      model: "stub-model",
      isAvailable: () => true,
      run: async () => ({ success: true, output: "", exitCode: 0 }),
      switchToFallback: () => false,
    };

    expect(initializeWillieEngine(baseConfig(), () => "unused", engine)).toBe(
      engine,
    );
  });

  test("initializeRalphEngine returns the engine when available", () => {
    const engine: Engine = {
      name: "stub",
      model: "stub-model",
      isAvailable: () => true,
      run: async () => ({ success: true, output: "", exitCode: 0 }),
      switchToFallback: () => false,
    };

    expect(initializeRalphEngine(baseConfig(), () => "unused", engine)).toBe(
      engine,
    );
  });

  test("initializeRalphEngine logs the caller-specific unavailable message", () => {
    const engine: Engine = {
      name: "stub",
      model: "stub-model",
      isAvailable: () => false,
      run: async () => ({ success: true, output: "", exitCode: 0 }),
      switchToFallback: () => false,
    };
    const logSpy = spyOn(logger, "logError").mockImplementation(() => {});

    expect(
      initializeRalphEngine(
        baseConfig(),
        (engineName, cliName) => `${engineName} install ${cliName}`,
        engine,
      ),
    ).toBeNull();
    expect(logSpy).toHaveBeenCalledWith("stub install stub CLI");

    logSpy.mockRestore();
  });

  test("initializeWillieEngine logs the caller-specific unavailable message", () => {
    const engine: Engine = {
      name: "stub",
      model: "stub-model",
      isAvailable: () => false,
      run: async () => ({ success: true, output: "", exitCode: 0 }),
      switchToFallback: () => false,
    };
    const logSpy = spyOn(logger, "logError").mockImplementation(() => {});

    expect(
      initializeWillieEngine(
        baseConfig(),
        (engineName, cliName) => `${engineName} needs ${cliName}`,
        engine,
      ),
    ).toBeNull();
    expect(logSpy).toHaveBeenCalledWith("stub needs stub CLI");

    logSpy.mockRestore();
  });

  test("initializeRalphEngine logs invalid effort for the selected engine", () => {
    const logSpy = spyOn(logger, "logError").mockImplementation(() => {});

    expect(
      initializeRalphEngine(
        baseConfig({
          engine: "claude",
          ralphEffort: "xhigh",
        }),
        () => "unused",
      ),
    ).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      'Invalid effort level "xhigh" for claude. Supported levels: low, medium, high.',
    );

    logSpy.mockRestore();
  });

  test("initializeWillieEngine logs invalid effort for the selected engine", () => {
    const logSpy = spyOn(logger, "logError").mockImplementation(() => {});

    expect(
      initializeWillieEngine(
        baseConfig({
          engine: "claude",
          willieEffort: "xhigh",
        }),
        () => "unused",
      ),
    ).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      'Invalid effort level "xhigh" for claude. Supported levels: low, medium, high.',
    );

    logSpy.mockRestore();
  });
});
