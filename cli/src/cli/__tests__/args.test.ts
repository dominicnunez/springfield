import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../config/loader.js";
import { mergeOptions, parseArgs } from "../args.js";

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    engine: "opencode",
    claudeModel: "sonnet",
    claudeEffort: "high",
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
    willieModel: undefined,
    willieEffort: undefined,
    logDir: join(homedir(), ".sfk", "logs"),
    progressDir: join(homedir(), ".sfk", "progress"),
    lintCmd: undefined,
    auditAfterComplete: false,
    ...overrides,
  };
}

describe("parseArgs", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sfk-args-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("treats non-directory positional arg as single task", () => {
    const { command, options } = parseArgs([
      "node",
      "sfk",
      "add dark mode toggle",
    ]);
    expect(command).toBe("run");
    expect(options.singleTask).toBe("add dark mode toggle");
  });

  it("does not set singleTask for directory positional arg", () => {
    const { command, options } = parseArgs(["node", "sfk", tempDir]);
    expect(command).toBe("run");
    expect(options.singleTask).toBeUndefined();
  });

  it("leaves singleTask undefined when no positional args", () => {
    const { command, options } = parseArgs(["node", "sfk"]);
    expect(command).toBe("run");
    expect(options.singleTask).toBeUndefined();
  });

  it("parses audit command", () => {
    const { command, auditOptions } = parseArgs(["node", "sfk", "audit"]);
    expect(command).toBe("audit");
    expect(auditOptions.startStep).toBe("audit");
  });

  it("parses audit command with step option", () => {
    const { command, auditOptions } = parseArgs([
      "node",
      "sfk",
      "audit",
      "--step",
      "fix",
    ]);
    expect(command).toBe("audit");
    expect(auditOptions.startStep).toBe("fix");
  });

  it("parses --claude shortcut as engine override", () => {
    const { options } = parseArgs(["node", "sfk", "--claude"]);
    expect(options.engine).toBe("claude");
  });

  it("parses --opencode shortcut as engine override", () => {
    const { options } = parseArgs(["node", "sfk", "--opencode"]);
    expect(options.engine).toBe("opencode");
  });

  it("parses --skip-commit flag", () => {
    const { options } = parseArgs(["node", "sfk", "--skip-commit"]);
    expect(options.skipCommit).toBe(true);
  });

  it("parses --no-tests flag as skipTestVerify", () => {
    const { options } = parseArgs(["node", "sfk", "--no-tests"]);
    expect(options.skipTestVerify).toBe(true);
  });

  it("parses --max-iterations with value", () => {
    const { options } = parseArgs(["node", "sfk", "--max-iterations", "25"]);
    expect(options.maxIterations).toBe(25);
  });

  it("parses audit --audit-prompt with path", () => {
    const { auditOptions } = parseArgs([
      "node",
      "sfk",
      "audit",
      "--audit-prompt",
      "custom.md",
    ]);
    expect(auditOptions.auditPrompt).toBe("custom.md");
  });

  it("parses audit --max-iterations", () => {
    const { auditOptions } = parseArgs([
      "node",
      "sfk",
      "audit",
      "--max-iterations",
      "5",
    ]);
    expect(auditOptions.maxIterations).toBe(5);
  });
});

describe("mergeOptions", () => {
  it("returns config unchanged when no CLI options set", () => {
    const config = baseConfig();
    const merged = mergeOptions(config, {});

    expect(merged.engine).toBe("opencode");
    expect(merged.maxIterations).toBe(10);
    expect(merged.skipCommit).toBe(false);
  });

  it("does not mutate original config", () => {
    const config = baseConfig();
    const merged = mergeOptions(config, { engine: "claude" });

    expect(merged.engine).toBe("claude");
    expect(config.engine).toBe("opencode");
  });

  it("overrides engine", () => {
    const config = baseConfig({ engine: "opencode" });
    const merged = mergeOptions(config, { engine: "claude" });

    expect(merged.engine).toBe("claude");
  });

  it("sets claude model when engine is claude", () => {
    const config = baseConfig({ engine: "claude", claudeModel: "sonnet" });
    const merged = mergeOptions(config, { model: "opus" });

    expect(merged.claudeModel).toBe("opus");
    expect(merged.ocPrimeModel).toBe("big-pickle"); // unchanged
  });

  it("sets opencode model when engine is opencode", () => {
    const config = baseConfig({
      engine: "opencode",
      ocPrimeModel: "big-pickle",
    });
    const merged = mergeOptions(config, { model: "gpt-5" });

    expect(merged.ocPrimeModel).toBe("gpt-5");
    expect(merged.claudeModel).toBe("sonnet"); // unchanged
  });

  it("routes model to correct engine after engine override in same merge", () => {
    // If CLI passes --claude --model opus, engine changes first, then model routes to claude
    const config = baseConfig({ engine: "opencode" });
    const merged = mergeOptions(config, { engine: "claude", model: "opus" });

    expect(merged.engine).toBe("claude");
    expect(merged.claudeModel).toBe("opus");
  });

  it("overrides maxIterations", () => {
    const config = baseConfig({ maxIterations: 10 });
    const merged = mergeOptions(config, { maxIterations: 99 });

    expect(merged.maxIterations).toBe(99);
  });

  it("overrides sleepSeconds", () => {
    const config = baseConfig({ sleepSeconds: 2 });
    const merged = mergeOptions(config, { sleepSeconds: 0 });

    expect(merged.sleepSeconds).toBe(0);
  });

  it("overrides skipCommit", () => {
    const config = baseConfig({ skipCommit: false });
    const merged = mergeOptions(config, { skipCommit: true });

    expect(merged.skipCommit).toBe(true);
  });

  it("overrides skipTestVerify", () => {
    const config = baseConfig({ skipTestVerify: false });
    const merged = mergeOptions(config, { skipTestVerify: true });

    expect(merged.skipTestVerify).toBe(true);
  });

  it("overrides testCmd", () => {
    const config = baseConfig({ testCmd: undefined });
    const merged = mergeOptions(config, { testCmd: "bun test" });

    expect(merged.testCmd).toBe("bun test");
  });

  it("sets auditAfterComplete when auditAfter is true", () => {
    const config = baseConfig({ auditAfterComplete: false });
    const merged = mergeOptions(config, { auditAfter: true });

    expect(merged.auditAfterComplete).toBe(true);
  });

  it("does not set auditAfterComplete when auditAfter is undefined", () => {
    const config = baseConfig({ auditAfterComplete: false });
    const merged = mergeOptions(config, {});

    expect(merged.auditAfterComplete).toBe(false);
  });
});
