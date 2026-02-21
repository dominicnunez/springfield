import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { logWarning, printDivider } from "../ui/logger.js";

// Test file patterns
const TEST_FILE_PATTERNS = [
  /\.(test|spec)\.(ts|js|tsx|jsx|py)$/,
  /_test\.(go|py)$/,
  /test_.*\.py$/,
];

export interface TestResult {
  passed: boolean;
  output: string;
  exitCode: number;
}

export interface VerificationResult {
  testsWritten: boolean;
  testsPassed: boolean;
  testFiles: string[];
  testOutput?: string;
}

/**
 * Auto-detect test command based on project files
 */
export function detectTestCommand(): string | undefined {
  // Check package.json for test script
  if (existsSync("package.json")) {
    try {
      const content = readFileSync("package.json", "utf-8");
      const pkg = JSON.parse(content);
      if (pkg.scripts?.test) {
        // Detect package manager
        if (existsSync("bun.lockb")) {
          return "bun test";
        } else if (existsSync("pnpm-lock.yaml")) {
          return "pnpm test";
        } else if (existsSync("yarn.lock")) {
          return "yarn test";
        }
        return "npm test";
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check for common test config files
  if (existsSync("vitest.config.ts") || existsSync("vitest.config.js")) {
    return "npx vitest run";
  }

  if (existsSync("jest.config.ts") || existsSync("jest.config.js")) {
    return "npx jest";
  }

  // Python
  if (existsSync("pytest.ini") || existsSync("pyproject.toml")) {
    return "pytest";
  }

  // Go
  if (existsSync("go.mod")) {
    return "go test ./...";
  }

  // Rust
  if (existsSync("Cargo.toml")) {
    return "cargo test";
  }

  return undefined;
}

/**
 * Check if a file is a test file
 */
function isTestFile(filename: string): boolean {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

/**
 * Get list of changed test files using git
 */
export function getChangedTestFiles(): string[] {
  const testFiles: Set<string> = new Set();

  // Check unstaged changes
  const unstaged = spawnSync("git", ["diff", "--name-only", "HEAD"], {
    encoding: "utf-8",
    cwd: process.cwd(),
  });

  if (unstaged.stdout) {
    for (const file of unstaged.stdout.split("\n")) {
      if (file && isTestFile(file)) {
        testFiles.add(file);
      }
    }
  }

  // Check staged changes
  const staged = spawnSync("git", ["diff", "--cached", "--name-only"], {
    encoding: "utf-8",
    cwd: process.cwd(),
  });

  if (staged.stdout) {
    for (const file of staged.stdout.split("\n")) {
      if (file && isTestFile(file)) {
        testFiles.add(file);
      }
    }
  }

  // Check last commit (in case AI already committed)
  const lastCommit = spawnSync(
    "git",
    ["diff", "--name-only", "HEAD~1", "HEAD"],
    {
      encoding: "utf-8",
      cwd: process.cwd(),
    },
  );

  if (lastCommit.stdout && lastCommit.status === 0) {
    for (const file of lastCommit.stdout.split("\n")) {
      if (file && isTestFile(file)) {
        testFiles.add(file);
      }
    }
  }

  return Array.from(testFiles);
}

/**
 * Verify that test files were written
 */
export function verifyTestsWritten(): { success: boolean; files: string[] } {
  const testFiles = getChangedTestFiles();

  if (testFiles.length === 0) {
    logWarning("No test files were created or modified");
    console.log("  No test files were created or modified this iteration");
    return { success: false, files: [] };
  }

  console.log("  Test files changed:");
  for (const file of testFiles) {
    console.log(`    ${file}`);
  }

  return { success: true, files: testFiles };
}

/**
 * Run the test suite
 */
export function runTests(testCmd: string): TestResult {
  console.log("");
  console.log(`  Running test verification: ${testCmd}`);
  printDivider();

  const parts = testCmd.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  const result = spawnSync(cmd, args, {
    encoding: "utf-8",
    cwd: process.cwd(),
    stdio: ["inherit", "pipe", "pipe"],
  });

  const output = (result.stdout || "") + (result.stderr || "");
  console.log(output);
  printDivider();

  const passed = result.status === 0;

  if (passed) {
    console.log("  Tests passed!");
  } else {
    console.log(`  Tests failed (exit code: ${result.status})`);
  }

  return {
    passed,
    output,
    exitCode: result.status ?? 1,
  };
}

/**
 * Full verification: check tests were written and they pass
 */
export function verify(testCmd: string | undefined): VerificationResult {
  const result: VerificationResult = {
    testsWritten: false,
    testsPassed: false,
    testFiles: [],
  };

  // Skip if no test command
  if (!testCmd) {
    logWarning("No test command detected, skipping verification");
    result.testsWritten = true; // Don't block on this
    result.testsPassed = true;
    return result;
  }

  // Check if tests were written
  console.log("");
  console.log("  Checking if tests were written...");
  const writtenCheck = verifyTestsWritten();
  result.testsWritten = writtenCheck.success;
  result.testFiles = writtenCheck.files;

  if (!result.testsWritten) {
    return result;
  }

  // Run tests
  const testResult = runTests(testCmd);
  result.testsPassed = testResult.passed;
  result.testOutput = testResult.output;

  return result;
}
