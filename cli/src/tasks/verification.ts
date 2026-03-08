import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { logWarning, printDivider } from "../ui/logger.js";

// Test file patterns
const TEST_FILE_PATTERNS = [
  /\.(test|spec)\.(ts|js|tsx|jsx|py)$/i,
  /_test\.(go|py)$/i,
  /test_.*\.py$/i,
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

type PackageManager = "bun" | "pnpm" | "yarn" | "npm";
type ProbeMode = "any" | "all";

interface CommandProbe {
  command: string;
  files: string[];
  mode?: ProbeMode;
}

const TEST_COMMAND_PROBES: readonly CommandProbe[] = [
  {
    command: "npx vitest run",
    files: ["vitest.config.ts", "vitest.config.js"],
  },
  { command: "npx jest", files: ["jest.config.ts", "jest.config.js"] },
  { command: "pytest", files: ["pytest.ini", "pyproject.toml"] },
  { command: "go test ./...", files: ["go.mod"] },
  { command: "cargo test", files: ["Cargo.toml"] },
];

const ESLINT_CONFIGS = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
] as const;

const LINT_COMMAND_PROBES: readonly CommandProbe[] = [
  { command: "npx biome check .", files: ["biome.json", "biome.jsonc"] },
  { command: "npx eslint .", files: [...ESLINT_CONFIGS] },
  {
    command: "golangci-lint run",
    files: ["go.mod", ".golangci.yml"],
    mode: "all",
  },
  { command: "cargo clippy", files: ["Cargo.toml"] },
];

/**
 * Detect which package manager the project uses based on lockfiles
 */
export function detectPackageManager(): PackageManager {
  if (existsSync("bun.lockb")) return "bun";
  if (existsSync("pnpm-lock.yaml")) return "pnpm";
  if (existsSync("yarn.lock")) return "yarn";
  return "npm";
}

/**
 * Check package.json for a script and return the PM-specific run command.
 * Special-cases "test" since all PMs support it as a first-class command.
 */
export function detectPackageScript(scriptName: string): string | undefined {
  if (!existsSync("package.json")) return undefined;

  try {
    const content = readFileSync("package.json", "utf-8");
    const pkg = JSON.parse(content);
    if (!pkg.scripts?.[scriptName]) return undefined;

    const pm = detectPackageManager();
    if (scriptName === "test") return `${pm} test`;
    return `${pm} run ${scriptName}`;
  } catch {
    return undefined;
  }
}

function matchesProbe(probe: CommandProbe): boolean {
  if (probe.mode === "all") {
    return probe.files.every((file) => existsSync(file));
  }

  return probe.files.some((file) => existsSync(file));
}

function detectCommand(
  scriptName: string,
  probes: readonly CommandProbe[],
): string | undefined {
  const fromPkg = detectPackageScript(scriptName);
  if (fromPkg) {
    return fromPkg;
  }

  return probes.find(matchesProbe)?.command;
}

/**
 * Auto-detect test command based on project files
 */
export function detectTestCommand(): string | undefined {
  return detectCommand("test", TEST_COMMAND_PROBES);
}

/**
 * Auto-detect lint command based on project files
 */
export function detectLintCommand(): string | undefined {
  return detectCommand("lint", LINT_COMMAND_PROBES);
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

  if (unstaged.error) {
    logWarning(`git diff failed: ${unstaged.error.message}`);
  } else if (unstaged.stdout) {
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

  if (staged.error) {
    logWarning(`git diff --cached failed: ${staged.error.message}`);
  } else if (staged.stdout) {
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

  if (lastCommit.error) {
    logWarning(`git diff HEAD~1 HEAD failed: ${lastCommit.error.message}`);
  } else if (lastCommit.stdout && lastCommit.status === 0) {
    for (const file of lastCommit.stdout.split("\n")) {
      if (file && isTestFile(file)) {
        testFiles.add(file);
      }
    }
  }

  // Check untracked files (new tests not yet staged)
  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    {
      encoding: "utf-8",
      cwd: process.cwd(),
    },
  );

  if (untracked.error) {
    logWarning(`git ls-files --others failed: ${untracked.error.message}`);
  } else if (untracked.stdout) {
    for (const file of untracked.stdout.split("\n")) {
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

  if (result.error) {
    const errorMsg = `Test command not found: ${cmd}`;
    console.log(errorMsg);
    printDivider();
    return {
      passed: false,
      output: errorMsg,
      exitCode: 1,
    };
  }

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
    result.testsWritten = false;
    result.testsPassed = false;
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
