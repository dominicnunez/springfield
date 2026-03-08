import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectLintCommand,
  detectPackageManager,
  detectTestCommand,
  getChangedTestFiles,
  verify,
} from "../verification.js";

function runGit(tempDir: string, args: string[]): void {
  spawnSync("git", args, { cwd: tempDir, stdio: "pipe" });
}

function initTempGitRepo(tempDir: string): void {
  runGit(tempDir, ["init"]);
  runGit(tempDir, ["config", "user.email", "test@test.com"]);
  runGit(tempDir, ["config", "user.name", "Test"]);
  writeFileSync(join(tempDir, "README.md"), "init");
  runGit(tempDir, ["add", "."]);
  runGit(tempDir, ["commit", "-m", "init"]);
}

function stageFiles(tempDir: string, ...files: string[]): void {
  runGit(tempDir, ["add", ...files]);
}

function commitFiles(
  tempDir: string,
  message: string,
  ...files: string[]
): void {
  if (files.length > 0) {
    stageFiles(tempDir, ...files);
  }
  runGit(tempDir, ["commit", "-m", message]);
}

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
        JSON.stringify({ scripts: { test: "jest" } }),
      );
      expect(detectTestCommand()).toBe("npm test");
    });

    test("detects bun test when bun.lockb exists", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { test: "bun test" } }),
      );
      writeFileSync(join(tempDir, "bun.lockb"), "");
      expect(detectTestCommand()).toBe("bun test");
    });

    test("detects pnpm test when pnpm-lock.yaml exists", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { test: "vitest" } }),
      );
      writeFileSync(join(tempDir, "pnpm-lock.yaml"), "");
      expect(detectTestCommand()).toBe("pnpm test");
    });

    test("detects yarn test when yarn.lock exists", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { test: "jest" } }),
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
        JSON.stringify({ scripts: { test: "custom test" } }),
      );
      writeFileSync(join(tempDir, "vitest.config.ts"), "export default {}");
      expect(detectTestCommand()).toBe("npm test");
    });

    test("returns undefined for package.json without test script", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { build: "tsc" } }),
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
      initTempGitRepo(tempDir);
    });

    test("detects unstaged test file changes", () => {
      writeFileSync(join(tempDir, "app.test.ts"), "test('a', () => {})");
      commitFiles(tempDir, "add test", "app.test.ts");

      // Modify the test file (unstaged change vs HEAD)
      writeFileSync(join(tempDir, "app.test.ts"), "test('b', () => {})");

      const files = getChangedTestFiles();
      expect(files).toContain("app.test.ts");
    });

    test("detects staged test file changes", () => {
      writeFileSync(join(tempDir, "widget.spec.js"), "describe('x', () => {})");
      stageFiles(tempDir, "widget.spec.js");

      const files = getChangedTestFiles();
      expect(files).toContain("widget.spec.js");
    });

    test("detects test files in last commit", () => {
      writeFileSync(join(tempDir, "handler_test.go"), "package main");
      commitFiles(tempDir, "add go test", "handler_test.go");

      const files = getChangedTestFiles();
      expect(files).toContain("handler_test.go");
    });

    test("ignores non-test files", () => {
      writeFileSync(join(tempDir, "app.ts"), "const x = 1;");
      stageFiles(tempDir, "app.ts");

      const files = getChangedTestFiles();
      expect(files).not.toContain("app.ts");
    });

    test("deduplicates files found in multiple sources", () => {
      // Create, stage, AND commit the same test file
      writeFileSync(join(tempDir, "dup.test.ts"), "v1");
      commitFiles(tempDir, "add dup", "dup.test.ts");

      // Now modify it (shows in both HEAD diff and unstaged)
      writeFileSync(join(tempDir, "dup.test.ts"), "v2");

      const files = getChangedTestFiles();
      const count = files.filter((f) => f === "dup.test.ts").length;
      expect(count).toBe(1);
    });

    test("matches python test patterns", () => {
      writeFileSync(join(tempDir, "test_utils.py"), "def test_foo(): pass");
      stageFiles(tempDir, "test_utils.py");

      const files = getChangedTestFiles();
      expect(files).toContain("test_utils.py");
    });

    test("returns empty array when no test files changed", () => {
      writeFileSync(join(tempDir, "main.ts"), "console.log('hi')");
      stageFiles(tempDir, "main.ts");

      const files = getChangedTestFiles();
      expect(files).toEqual([]);
    });

    test("detects untracked test files", () => {
      writeFileSync(join(tempDir, "new.test.js"), "test('x', () => {})");

      const files = getChangedTestFiles();
      expect(files).toContain("new.test.js");
    });

    test("does not detect ignored untracked test files", () => {
      writeFileSync(join(tempDir, ".gitignore"), "ignored.test.js\n");
      writeFileSync(join(tempDir, "ignored.test.js"), "test('x', () => {})");

      const files = getChangedTestFiles();
      expect(files).not.toContain("ignored.test.js");
    });
  });

  describe("detectPackageManager", () => {
    test("returns npm when no lockfile exists", () => {
      expect(detectPackageManager()).toBe("npm");
    });

    test("returns bun when bun.lockb exists", () => {
      writeFileSync(join(tempDir, "bun.lockb"), "");
      expect(detectPackageManager()).toBe("bun");
    });

    test("returns pnpm when pnpm-lock.yaml exists", () => {
      writeFileSync(join(tempDir, "pnpm-lock.yaml"), "");
      expect(detectPackageManager()).toBe("pnpm");
    });

    test("returns yarn when yarn.lock exists", () => {
      writeFileSync(join(tempDir, "yarn.lock"), "");
      expect(detectPackageManager()).toBe("yarn");
    });
  });

  describe("detectLintCommand", () => {
    test("returns undefined when no config files exist", () => {
      expect(detectLintCommand()).toBeUndefined();
    });

    test("detects lint script from package.json with npm", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { lint: "eslint ." } }),
      );
      expect(detectLintCommand()).toBe("npm run lint");
    });

    test("detects lint script from package.json with bun", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { lint: "eslint ." } }),
      );
      writeFileSync(join(tempDir, "bun.lockb"), "");
      expect(detectLintCommand()).toBe("bun run lint");
    });

    test("detects lint script from package.json with pnpm", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { lint: "eslint ." } }),
      );
      writeFileSync(join(tempDir, "pnpm-lock.yaml"), "");
      expect(detectLintCommand()).toBe("pnpm run lint");
    });

    test("detects lint script from package.json with yarn", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { lint: "eslint ." } }),
      );
      writeFileSync(join(tempDir, "yarn.lock"), "");
      expect(detectLintCommand()).toBe("yarn run lint");
    });

    test("detects biome from biome.json", () => {
      writeFileSync(join(tempDir, "biome.json"), "{}");
      expect(detectLintCommand()).toBe("npx biome check .");
    });

    test("detects biome from biome.jsonc", () => {
      writeFileSync(join(tempDir, "biome.jsonc"), "{}");
      expect(detectLintCommand()).toBe("npx biome check .");
    });

    test("detects eslint from eslint.config.js", () => {
      writeFileSync(join(tempDir, "eslint.config.js"), "module.exports = {}");
      expect(detectLintCommand()).toBe("npx eslint .");
    });

    test("detects eslint from .eslintrc.json", () => {
      writeFileSync(join(tempDir, ".eslintrc.json"), "{}");
      expect(detectLintCommand()).toBe("npx eslint .");
    });

    test("detects golangci-lint when go.mod and .golangci.yml both exist", () => {
      writeFileSync(join(tempDir, "go.mod"), "module example.com/test");
      writeFileSync(join(tempDir, ".golangci.yml"), "linters:");
      expect(detectLintCommand()).toBe("golangci-lint run");
    });

    test("returns undefined for go.mod without .golangci.yml", () => {
      writeFileSync(join(tempDir, "go.mod"), "module example.com/test");
      expect(detectLintCommand()).toBeUndefined();
    });

    test("detects cargo clippy from Cargo.toml", () => {
      writeFileSync(join(tempDir, "Cargo.toml"), "[package]");
      expect(detectLintCommand()).toBe("cargo clippy");
    });

    test("package.json lint script takes precedence over config files", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { lint: "custom-lint" } }),
      );
      writeFileSync(join(tempDir, "biome.json"), "{}");
      writeFileSync(join(tempDir, "eslint.config.js"), "module.exports = {}");
      expect(detectLintCommand()).toBe("npm run lint");
    });

    test("returns undefined for package.json without lint script", () => {
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ scripts: { build: "tsc" } }),
      );
      expect(detectLintCommand()).toBeUndefined();
    });

    test("handles malformed package.json gracefully", () => {
      writeFileSync(join(tempDir, "package.json"), "not valid json");
      expect(detectLintCommand()).toBeUndefined();
    });
  });

  describe("verify", () => {
    test("skips verification when no test command provided", () => {
      const result = verify(undefined);

      expect(result.testsWritten).toBe(false);
      expect(result.testsPassed).toBe(false);
    });

    test("reports testsWritten=false when no test files changed", () => {
      initTempGitRepo(tempDir);

      const result = verify("echo 'tests pass'");

      expect(result.testsWritten).toBe(false);
      expect(result.testsPassed).toBe(false);
      expect(result.testFiles).toEqual([]);
    });

    test("runs test command and reports pass", () => {
      initTempGitRepo(tempDir);

      writeFileSync(join(tempDir, "app.test.ts"), "test('a', () => {})");
      stageFiles(tempDir, "app.test.ts");

      const result = verify("echo 'all tests passed'");

      expect(result.testsWritten).toBe(true);
      expect(result.testFiles).toContain("app.test.ts");
      expect(result.testsPassed).toBe(true);
    });

    test("runs test command and reports failure", () => {
      initTempGitRepo(tempDir);

      writeFileSync(join(tempDir, "app.test.ts"), "test('a', () => {})");
      stageFiles(tempDir, "app.test.ts");

      const result = verify("exit 1");

      expect(result.testsWritten).toBe(true);
      expect(result.testsPassed).toBe(false);
      expect(result.testOutput).toBeDefined();
    });
  });
});
