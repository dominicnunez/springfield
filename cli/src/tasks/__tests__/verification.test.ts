import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { detectTestCommand, getChangedTestFiles, verify } from "../verification.js";

describe("tasks/verification", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), "ralph-verification-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("detectTestCommand", () => {
    test("returns undefined when no config files exist", () => {
      expect(detectTestCommand()).toBeUndefined();
    });

    test("detects npm test from package.json", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { test: "jest" } })
      );
      expect(detectTestCommand()).toBe("npm test");
    });

    test("detects bun test when bun.lockb exists", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { test: "bun test" } })
      );
      writeFileSync(join(tempDir, "bun.lockb"), "");
      expect(detectTestCommand()).toBe("bun test");
    });

    test("detects pnpm test when pnpm-lock.yaml exists", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { test: "vitest" } })
      );
      writeFileSync(join(tempDir, "pnpm-lock.yaml"), "");
      expect(detectTestCommand()).toBe("pnpm test");
    });

    test("detects yarn test when yarn.lock exists", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { test: "jest" } })
      );
      writeFileSync(join(tempDir, "yarn.lock"), "");
      expect(detectTestCommand()).toBe("yarn test");
    });

    test("detects vitest from config file", () => {
      writeFileSync(join(tempDir, "vitest.config.ts"), "export default {}");
      expect(detectTestCommand()).toBe("npx vitest run");
    });

    test("detects vitest from js config file", () => {
      writeFileSync(join(tempDir, "vitest.config.js"), "module.exports = {}");
      expect(detectTestCommand()).toBe("npx vitest run");
    });

    test("detects jest from config file", () => {
      writeFileSync(join(tempDir, "jest.config.ts"), "export default {}");
      expect(detectTestCommand()).toBe("npx jest");
    });

    test("detects jest from js config file", () => {
      writeFileSync(join(tempDir, "jest.config.js"), "module.exports = {}");
      expect(detectTestCommand()).toBe("npx jest");
    });

    test("detects pytest from pytest.ini", () => {
      writeFileSync(join(tempDir, "pytest.ini"), "[pytest]");
      expect(detectTestCommand()).toBe("pytest");
    });

    test("detects pytest from pyproject.toml", () => {
      writeFileSync(join(tempDir, "pyproject.toml"), "[tool.pytest]");
      expect(detectTestCommand()).toBe("pytest");
    });

    test("detects go test from go.mod", () => {
      writeFileSync(join(tempDir, "go.mod"), "module example.com/test");
      expect(detectTestCommand()).toBe("go test ./...");
    });

    test("detects cargo test from Cargo.toml", () => {
      writeFileSync(join(tempDir, "Cargo.toml"), "[package]");
      expect(detectTestCommand()).toBe("cargo test");
    });

    test("package.json takes precedence over config files", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { test: "custom test" } })
      );
      writeFileSync(join(tempDir, "vitest.config.ts"), "export default {}");
      expect(detectTestCommand()).toBe("npm test");
    });

    test("returns undefined for package.json without test script", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { build: "tsc" } })
      );
      expect(detectTestCommand()).toBeUndefined();
    });

    test("handles malformed package.json gracefully", () => {
      writeFileSync(join(tempDir, "package.json"), "not valid json");
      expect(detectTestCommand()).toBeUndefined();
    });
  });

  describe("getChangedTestFiles", () => {
    beforeEach(() => {
      // Initialize a git repo in the temp dir
      spawnSync("git", ["init"], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: tempDir, stdio: "pipe" });

      // Create initial commit so HEAD exists
      writeFileSync(join(tempDir, "README.md"), "init");
      spawnSync("git", ["add", "."], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["commit", "-m", "init"], { cwd: tempDir, stdio: "pipe" });
    });

    test("detects unstaged test file changes", () => {
      writeFileSync(join(tempDir, "app.test.ts"), "test('a', () => {})");
      spawnSync("git", ["add", "app.test.ts"], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["commit", "-m", "add test"], { cwd: tempDir, stdio: "pipe" });

      // Modify the test file (unstaged change vs HEAD)
      writeFileSync(join(tempDir, "app.test.ts"), "test('b', () => {})");

      const files = getChangedTestFiles();
      expect(files).toContain("app.test.ts");
    });

    test("detects staged test file changes", () => {
      writeFileSync(join(tempDir, "widget.spec.js"), "describe('x', () => {})");
      spawnSync("git", ["add", "widget.spec.js"], { cwd: tempDir, stdio: "pipe" });

      const files = getChangedTestFiles();
      expect(files).toContain("widget.spec.js");
    });

    test("detects test files in last commit", () => {
      writeFileSync(join(tempDir, "handler_test.go"), "package main");
      spawnSync("git", ["add", "handler_test.go"], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["commit", "-m", "add go test"], { cwd: tempDir, stdio: "pipe" });

      const files = getChangedTestFiles();
      expect(files).toContain("handler_test.go");
    });

    test("ignores non-test files", () => {
      writeFileSync(join(tempDir, "app.ts"), "const x = 1;");
      spawnSync("git", ["add", "app.ts"], { cwd: tempDir, stdio: "pipe" });

      const files = getChangedTestFiles();
      expect(files).not.toContain("app.ts");
    });

    test("deduplicates files found in multiple sources", () => {
      // Create, stage, AND commit the same test file
      writeFileSync(join(tempDir, "dup.test.ts"), "v1");
      spawnSync("git", ["add", "dup.test.ts"], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["commit", "-m", "add dup"], { cwd: tempDir, stdio: "pipe" });

      // Now modify it (shows in both HEAD diff and unstaged)
      writeFileSync(join(tempDir, "dup.test.ts"), "v2");

      const files = getChangedTestFiles();
      const count = files.filter(f => f === "dup.test.ts").length;
      expect(count).toBe(1);
    });

    test("matches python test patterns", () => {
      writeFileSync(join(tempDir, "test_utils.py"), "def test_foo(): pass");
      spawnSync("git", ["add", "test_utils.py"], { cwd: tempDir, stdio: "pipe" });

      const files = getChangedTestFiles();
      expect(files).toContain("test_utils.py");
    });

    test("returns empty array when no test files changed", () => {
      writeFileSync(join(tempDir, "main.ts"), "console.log('hi')");
      spawnSync("git", ["add", "main.ts"], { cwd: tempDir, stdio: "pipe" });

      const files = getChangedTestFiles();
      expect(files).toEqual([]);
    });
  });

  describe("verify", () => {
    test("skips verification when no test command provided", () => {
      const result = verify(undefined);

      expect(result.testsWritten).toBe(true);
      expect(result.testsPassed).toBe(true);
    });

    test("reports testsWritten=false when no test files changed", () => {
      // Initialize git repo
      spawnSync("git", ["init"], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "README.md"), "init");
      spawnSync("git", ["add", "."], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["commit", "-m", "init"], { cwd: tempDir, stdio: "pipe" });

      const result = verify("echo 'tests pass'");

      expect(result.testsWritten).toBe(false);
      expect(result.testsPassed).toBe(false);
      expect(result.testFiles).toEqual([]);
    });

    test("runs test command and reports pass", () => {
      // Initialize git repo with a test file change
      spawnSync("git", ["init"], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "README.md"), "init");
      spawnSync("git", ["add", "."], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["commit", "-m", "init"], { cwd: tempDir, stdio: "pipe" });

      writeFileSync(join(tempDir, "app.test.ts"), "test('a', () => {})");
      spawnSync("git", ["add", "app.test.ts"], { cwd: tempDir, stdio: "pipe" });

      const result = verify("echo 'all tests passed'");

      expect(result.testsWritten).toBe(true);
      expect(result.testFiles).toContain("app.test.ts");
      expect(result.testsPassed).toBe(true);
    });

    test("runs test command and reports failure", () => {
      spawnSync("git", ["init"], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "README.md"), "init");
      spawnSync("git", ["add", "."], { cwd: tempDir, stdio: "pipe" });
      spawnSync("git", ["commit", "-m", "init"], { cwd: tempDir, stdio: "pipe" });

      writeFileSync(join(tempDir, "app.test.ts"), "test('a', () => {})");
      spawnSync("git", ["add", "app.test.ts"], { cwd: tempDir, stdio: "pipe" });

      const result = verify("exit 1");

      expect(result.testsWritten).toBe(true);
      expect(result.testsPassed).toBe(false);
      expect(result.testOutput).toBeDefined();
    });
  });
});
