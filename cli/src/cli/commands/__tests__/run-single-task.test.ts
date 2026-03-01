import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../../config/loader.js";
import {
  type Engine,
  generateSingleTaskPrompt,
} from "../../../engines/base.js";
import { initLogger } from "../../../ui/logger.js";
import { runSingleTask } from "../run.js";

describe("single task mode", () => {
  let originalCwd: string;
  let originalPath: string | undefined;
  let tempRoot: string;
  let projectDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalPath = process.env.PATH;
    tempRoot = mkdtempSync(join(tmpdir(), "ralph-single-task-"));
    projectDir = join(tempRoot, "project");

    mkdirIfMissing(projectDir);
    process.chdir(projectDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalPath !== undefined) {
      process.env.PATH = originalPath;
    } else {
      delete process.env.PATH;
    }
    initLogger({});
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("generateSingleTaskPrompt includes in-memory PRD instructions", () => {
    const prompt = generateSingleTaskPrompt("ship a toaster", {
      skipCommit: true,
      progressFile: "/tmp/progress.log",
    });
    expect(prompt).toContain("In-Memory PRD");
    expect(prompt).toContain("Do NOT create or modify PRD.md on disk.");
    expect(prompt).toContain("ship a toaster");
    expect(prompt).not.toContain("Read PRD.md and find the first task");
  });

  test("runSingleTask executes once and avoids PRD.md", async () => {
    const config: Config = {
      engine: "opencode",
      maxIterations: 1,
      sleepSeconds: 0,
      skipCommit: true,
      pushAfterCommit: false,
      claudeModel: "sonnet",
      claudeEffort: "high",
      ocPrimeModel: "stub-model",
      ocFallModel: undefined,
      softLimitRetries: 3,
      softLimitWait: 30,
      testCmd: undefined,
      skipTestVerify: true,
      maxConsecutiveFailures: 3,
      ralphModel: undefined,
      ralphEffort: undefined,
      willieMaxIterations: 0,
      willieAuditPrompt: undefined,
      willieModel: undefined,
      willieEffort: undefined,
      logDir: join(tempRoot, "logs"),
      progressDir: join(tempRoot, "progress"),
      lintCmd: undefined,
      auditAfterComplete: false,
    };

    const task = "add single task flow";
    const prompts: string[] = [];
    const stubEngine: Engine = {
      name: "stub",
      model: "stub-model",
      isAvailable: () => true,
      run: async (prompt: string) => {
        prompts.push(prompt);
        return {
          success: true,
          output: "<promise>COMPLETE</promise>",
          exitCode: 0,
        };
      },
      switchToFallback: () => false,
    };

    await runSingleTask(config, { prdPath: "PRD.md" }, task, stubEngine);

    expect(prompts.length).toBe(1);
    expect(prompts[0]).toContain(task);
    expect(existsSync(join(projectDir, "PRD.md"))).toBe(false);
  });
});

function mkdirIfMissing(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}
