import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../config/loader.js";
import type { Engine } from "../../engines/base.js";
import { initLogger } from "../../ui/logger.js";
import { initializeAuditSession } from "../audit-session.js";

function baseConfig(root: string, overrides: Partial<Config> = {}): Config {
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
    willieModel: "audit-model",
    willieEffort: "medium",
    williePushAfterFix: false,
    lintCmd: undefined,
    logDir: join(root, "logs"),
    progressDir: join(root, "progress"),
    auditAfterComplete: false,
    ...overrides,
  };
}

function stubEngine(isAvailable = true): Engine {
  return {
    name: "stub",
    model: "stub-model",
    isAvailable: () => isAvailable,
    run: async () => ({
      success: true,
      output: "",
      exitCode: 0,
    }),
    switchToFallback: () => false,
  };
}

describe("audit session", () => {
  let originalCwd: string;
  let tempRoot: string;
  let projectDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempRoot = mkdtempSync(join(tmpdir(), "audit-session-"));
    projectDir = join(tempRoot, "project");
    mkdirSync(projectDir, { recursive: true });
    process.chdir(projectDir);
    initLogger({});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    initLogger({});
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("prefers CLI audit prompt path and bootstraps exception directory", () => {
    const cliPrompt = join(projectDir, "custom-audit.md");
    const projectPrompt = join(projectDir, "audit", "prompt.md");
    mkdirSync(join(projectDir, "audit"), { recursive: true });
    writeFileSync(cliPrompt, "cli prompt");
    writeFileSync(projectPrompt, "project prompt");

    const session = initializeAuditSession(
      baseConfig(tempRoot),
      { auditPromptPath: cliPrompt },
      "fallback prompt",
      stubEngine(),
    );

    expect(session).not.toBeNull();
    expect(session?.auditPrompt).toBe("cli prompt");
    expect(session?.auditPromptSource).toBe(cliPrompt);
    expect(existsSync(join(projectDir, "audit", "design"))).toBe(true);
    expect(existsSync(join(projectDir, "audit", "misreads"))).toBe(true);
    expect(existsSync(join(projectDir, "audit", "risks"))).toBe(true);
  });

  test("detects lint and test commands during session initialization", () => {
    writeFileSync(join(projectDir, "biome.json"), "{}");
    writeFileSync(
      join(projectDir, "package.json"),
      JSON.stringify({ scripts: { test: "vitest" } }),
    );

    const session = initializeAuditSession(
      baseConfig(tempRoot),
      {},
      "fallback prompt",
      stubEngine(),
    );

    expect(session).not.toBeNull();
    expect(session?.lintCmd).toBe("npx biome check .");
    expect(session?.testCmd).toBe("npm test");
    expect(session?.fixPrompt).toContain("npx biome check .");
    expect(session?.fixPrompt).toContain("npm test");
    expect(session?.fixPrompt).toContain("Do NOT push changes");
  });

  test("passes Willie push config into the fix prompt", () => {
    const session = initializeAuditSession(
      baseConfig(tempRoot, { williePushAfterFix: true }),
      {},
      "fallback prompt",
      stubEngine(),
    );

    expect(session).not.toBeNull();
    expect(session?.fixPrompt).toContain("push committed changes");
  });

  test("returns null when the selected engine is unavailable", () => {
    const session = initializeAuditSession(
      baseConfig(tempRoot),
      {},
      "fallback prompt",
      stubEngine(false),
    );

    expect(session).toBeNull();
  });
});
