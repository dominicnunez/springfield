import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendFailure,
  appendProgress,
  getProgressFile,
  type IterationResult,
  initProgress,
  readProgress,
} from "../progress.js";

describe("tasks/progress", () => {
  let tempDir: string;
  let progressDir: string;
  let progressFile: string;
  const projectName = "test-project";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ralph-progress-test-"));
    progressDir = join(tempDir, "progress");
    progressFile = getProgressFile(projectName, progressDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getProgressFile", () => {
    test("constructs correct path with sanitized name and hash", () => {
      const result = getProgressFile("my-app", "/home/user/.ralph/progress");
      expect(result).toMatch(
        /^\/home\/user\/\.ralph\/progress\/progress-my_app-[0-9a-f]{6}\.log$/,
      );
    });
  });

  describe("initProgress", () => {
    test("creates progress directory and file if they don't exist", () => {
      expect(existsSync(progressDir)).toBe(false);
      expect(existsSync(progressFile)).toBe(false);
      initProgress(progressDir, progressFile);
      expect(existsSync(progressDir)).toBe(true);
      expect(existsSync(progressFile)).toBe(true);
    });

    test("initializes with header", () => {
      initProgress(progressDir, progressFile);
      const content = readFileSync(progressFile, "utf-8");
      expect(content).toBe("# Progress Log\n\n");
    });

    test("does not overwrite existing file", () => {
      initProgress(progressDir, progressFile);
      appendProgress(progressFile, {
        iteration: 1,
        taskName: "Test task",
        success: true,
        message: "Done",
      });
      const contentBefore = readFileSync(progressFile, "utf-8");

      initProgress(progressDir, progressFile);
      const contentAfter = readFileSync(progressFile, "utf-8");

      expect(contentAfter).toBe(contentBefore);
    });
  });

  describe("readProgress", () => {
    test("returns empty string for non-existent file", () => {
      expect(readProgress(progressFile)).toBe("");
    });

    test("returns file content", () => {
      initProgress(progressDir, progressFile);
      expect(readProgress(progressFile)).toBe("# Progress Log\n\n");
    });
  });

  describe("appendProgress", () => {
    test("appends successful iteration", () => {
      initProgress(progressDir, progressFile);
      const result: IterationResult = {
        iteration: 1,
        taskName: "Add feature X",
        success: true,
        message: "Feature implemented successfully",
      };

      appendProgress(progressFile, result);
      const content = readProgress(progressFile);

      expect(content).toContain("## Iteration 1 - Add feature X");
      expect(content).toContain("Status: SUCCESS");
      expect(content).toContain("Feature implemented successfully");
    });

    test("appends failed iteration", () => {
      initProgress(progressDir, progressFile);
      const result: IterationResult = {
        iteration: 2,
        taskName: "Fix bug Y",
        success: false,
        message: "Tests still failing",
      };

      appendProgress(progressFile, result);
      const content = readProgress(progressFile);

      expect(content).toContain("## Iteration 2 - Fix bug Y");
      expect(content).toContain("Status: FAILED");
      expect(content).toContain("Tests still failing");
    });

    test("includes test file when provided", () => {
      initProgress(progressDir, progressFile);
      const result: IterationResult = {
        iteration: 1,
        taskName: "Add tests",
        success: true,
        message: "Tests added",
        testFile: "src/__tests__/feature.test.ts",
      };

      appendProgress(progressFile, result);
      const content = readProgress(progressFile);

      expect(content).toContain("Test file: src/__tests__/feature.test.ts");
    });

    test("includes files changed when provided", () => {
      initProgress(progressDir, progressFile);
      const result: IterationResult = {
        iteration: 1,
        taskName: "Refactor",
        success: true,
        message: "Refactored",
        filesChanged: ["src/a.ts", "src/b.ts", "src/c.ts"],
      };

      appendProgress(progressFile, result);
      const content = readProgress(progressFile);

      expect(content).toContain("Files changed: src/a.ts, src/b.ts, src/c.ts");
    });

    test("appends multiple iterations in order", () => {
      initProgress(progressDir, progressFile);

      appendProgress(progressFile, {
        iteration: 1,
        taskName: "Task 1",
        success: true,
        message: "Done 1",
      });

      appendProgress(progressFile, {
        iteration: 2,
        taskName: "Task 2",
        success: true,
        message: "Done 2",
      });

      const content = readProgress(progressFile);
      const idx1 = content.indexOf("Iteration 1");
      const idx2 = content.indexOf("Iteration 2");

      expect(idx1).toBeLessThan(idx2);
    });
  });

  describe("appendFailure", () => {
    test("appends failure with reason", () => {
      initProgress(progressDir, progressFile);
      appendFailure(progressFile, 3, "Tests did not pass");

      const content = readProgress(progressFile);
      expect(content).toContain("## FAILED - Iteration 3");
      expect(content).toContain("Reason: Tests did not pass");
    });

    test("includes details when provided", () => {
      initProgress(progressDir, progressFile);
      appendFailure(
        progressFile,
        4,
        "Build failed",
        "Missing dependency: lodash",
      );

      const content = readProgress(progressFile);
      expect(content).toContain("## FAILED - Iteration 4");
      expect(content).toContain("Reason: Build failed");
      expect(content).toContain("Details: Missing dependency: lodash");
    });

    test("omits details line when not provided", () => {
      initProgress(progressDir, progressFile);
      appendFailure(progressFile, 5, "Unknown error");

      const content = readProgress(progressFile);
      expect(content).toContain("Reason: Unknown error");
      expect(content).not.toContain("Details:");
    });
  });
});
