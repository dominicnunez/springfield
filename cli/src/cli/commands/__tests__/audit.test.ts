import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../../config/loader.js";
import type { Engine, EngineResult } from "../../../engines/base.js";
import {
  applyExceptionFilterToReport,
  buildAuditPromptWithExceptions,
  findMatchingException,
  parseAuditReport,
  parseChangedExceptionFiles,
  runPipeline,
  validateAuditSourcePath,
} from "../audit.js";

describe("audit step prompt building", () => {
  let originalCwd: string;
  let tempRoot: string;
  let projectDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempRoot = mkdtempSync(join(tmpdir(), "audit-command-"));
    projectDir = join(tempRoot, "project");
    mkdirSync(projectDir, { recursive: true });
    process.chdir(projectDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("adds exception-check instructions when no exception files exist", () => {
    const prompt = buildAuditPromptWithExceptions("base audit prompt");

    expect(prompt).toContain("base audit prompt");
    expect(prompt).toContain(
      "No source path was provided. Before auditing, inspect only lightweight top-level project metadata and directory names to determine the smallest source-code path to audit.",
    );
    expect(prompt).toContain(
      "Audit only that selected source-code path and its subpaths. Do not audit every repository path or file.",
    );
    expect(prompt).toContain(
      "Before writing audit/report.md, inspect the categorized mirrored exception files for each candidate finding as needed; for src/auth.ts, inspect audit/misreads/src/auth.md, audit/design/src/auth.md, and audit/risks/src/auth.md.",
    );
    expect(prompt).toContain(
      "Read only the categorized mirrored exception files and entries needed to rule in or rule out a candidate finding; do not ignore those directories, but avoid loading unrelated exception content.",
    );
  });

  test("lists current exception files without injecting their contents", () => {
    const exceptionsDir = join(projectDir, "audit", "risks");
    mkdirSync(join(exceptionsDir, "src"), { recursive: true });
    writeFileSync(
      join(exceptionsDir, "src", "rate-limit.md"),
      "# Exceptions\n\n### Accepted rate limit tradeoff\n**Line:** `12`\nCurrent backoff is intentional.\n",
    );

    const prompt = buildAuditPromptWithExceptions("base audit prompt");

    expect(prompt).toContain("Known exception files:");
    expect(prompt).toContain("audit/risks/src/rate-limit.md");
    expect(prompt).toContain(
      "If an exception still applies, suppress that finding instead of re-reporting it.",
    );
    expect(prompt).not.toContain("Accepted rate limit tradeoff");
    expect(prompt).not.toContain("Current backoff is intentional.");
  });

  test("explicit source path constrains audit scope and listed exceptions", () => {
    const exceptionsDir = join(projectDir, "audit", "design");
    mkdirSync(join(exceptionsDir, "src"), { recursive: true });
    mkdirSync(join(exceptionsDir, "docs"), { recursive: true });
    writeFileSync(join(exceptionsDir, "src", "auth.md"), "# Auth");
    writeFileSync(join(exceptionsDir, "docs", "guide.md"), "# Docs");

    const prompt = buildAuditPromptWithExceptions("base audit prompt", "src");

    expect(prompt).toContain(
      "Audit only `src` and, when it is a directory, its subpaths.",
    );
    expect(prompt).toContain("audit/design/src/auth.md");
    expect(prompt).not.toContain("audit/design/docs/guide.md");
  });

  test("explicit source file lists only its mirrored exception file", () => {
    const exceptionsDir = join(projectDir, "audit", "misreads");
    mkdirSync(join(exceptionsDir, "src"), { recursive: true });
    writeFileSync(join(exceptionsDir, "src", "auth.md"), "# Auth");
    writeFileSync(join(exceptionsDir, "src", "api.md"), "# API");

    const prompt = buildAuditPromptWithExceptions(
      "base audit prompt",
      "src/auth.ts",
    );

    expect(prompt).toContain(
      "Audit only `src/auth.ts` and, when it is a directory, its subpaths.",
    );
    expect(prompt).toContain("audit/misreads/src/auth.md");
    expect(prompt).not.toContain("audit/misreads/src/api.md");
  });

  test("validates explicit audit source path before agent execution", () => {
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(join(projectDir, "src", "auth.ts"), "export {};\n");

    expect(validateAuditSourcePath(undefined)).toBe(true);
    expect(validateAuditSourcePath("./")).toBe(true);
    expect(validateAuditSourcePath("src")).toBe(true);
    expect(validateAuditSourcePath("./src/auth.ts")).toBe(true);
    expect(validateAuditSourcePath("missing/path.ts")).toBe(false);
  });

  test("parseAuditReport parses multiple findings", () => {
    const findings = parseAuditReport(`### [Security] Hardcoded credentials
- **Severity**: Critical
- **File**: src/auth.ts:42
- **Details**: Password is hardcoded in source.
- **Suggested fix**: Load from environment.

### [Bug] Missing error handling
- **Severity**: High
- **File**: src/api.ts:10
- **Details**: Error from fetch is ignored.
- **Suggested fix**: Return the error to the caller.
`);

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      category: "Security",
      title: "Hardcoded credentials",
      severity: "Critical",
      file: "src/auth.ts",
    });
    expect(findings[1]).toMatchObject({
      category: "Bug",
      title: "Missing error handling",
      severity: "High",
      file: "src/api.ts",
    });
  });

  test("findMatchingException requires file match and textual similarity", () => {
    const exceptionsDir = join(projectDir, "audit", "risks");
    mkdirSync(join(exceptionsDir, "src"), { recursive: true });
    const filePath = join(exceptionsDir, "src", "auth.md");
    writeFileSync(
      filePath,
      `# Auth exceptions

### Hardcoded credentials in auth config

**Line:** \`12\`

**Reason:** This exact hardcoded credentials finding is accepted by design.

### Different issue on same file

**Line:** \`99\`

**Reason:** This is about timeout behavior, not credentials.
`,
    );

    const [matching, nonMatching] =
      parseAuditReport(`### [Security] Hardcoded credentials
- **Severity**: Critical
- **File**: src/auth.ts:42
- **Details**: Password is hardcoded in source.
- **Suggested fix**: Load from environment.

### [Bug] Missing validation
- **Severity**: Medium
- **File**: src/auth.ts:52
- **Details**: User input is not validated before use.
- **Suggested fix**: Validate input.
`);

    expect(findMatchingException(matching)).toBeTruthy();
    expect(findMatchingException(nonMatching)).toBeUndefined();
  });

  test("findMatchingException ignores exceptions in other mirrored files", () => {
    const exceptionsDir = join(projectDir, "audit", "risks");
    mkdirSync(join(exceptionsDir, "src"), { recursive: true });
    writeFileSync(
      join(exceptionsDir, "src", "api.md"),
      `# API exceptions

### Hardcoded credentials in auth config

**Line:** \`12\`

**Reason:** This exact hardcoded credentials finding is accepted by design.
`,
    );

    const [finding] = parseAuditReport(`### [Security] Hardcoded credentials
- **Severity**: Critical
- **File**: src/auth.ts:42
- **Details**: Password is hardcoded in source.
- **Suggested fix**: Load from environment.
`);

    expect(findMatchingException(finding)).toBeUndefined();
  });

  test("applyExceptionFilterToReport removes matched findings and keeps unmatched findings", () => {
    const exceptionsDir = join(projectDir, "audit", "risks");
    mkdirSync(join(exceptionsDir, "src"), { recursive: true });
    writeFileSync(
      join(exceptionsDir, "src", "auth.md"),
      `# Auth exceptions

### Hardcoded credentials

**Line:** \`12\`

**Reason:** Password is hardcoded in source and tracked as an accepted risk.
`,
    );
    writeFileSync(
      join(projectDir, "audit", "report.md"),
      `### [Security] Hardcoded credentials
- **Severity**: Critical
- **File**: src/auth.ts:42
- **Details**: Password is hardcoded in source.
- **Suggested fix**: Load from environment.

### [Bug] Missing error handling
- **Severity**: High
- **File**: src/api.ts:10
- **Details**: Error from fetch is ignored.
- **Suggested fix**: Return the error to the caller.
`,
    );

    const result = applyExceptionFilterToReport();

    expect(result.originalCount).toBe(2);
    expect(result.suppressedCount).toBe(1);
    expect(result.remainingCount).toBe(1);
    expect(
      readFileSync(join(projectDir, "audit", "report.md"), "utf-8"),
    ).toContain("Missing error handling");
    expect(
      readFileSync(join(projectDir, "audit", "report.md"), "utf-8"),
    ).not.toContain("Hardcoded credentials");
  });

  test("applyExceptionFilterToReport deletes the report when all findings are suppressed", () => {
    const exceptionsDir = join(projectDir, "audit", "risks");
    mkdirSync(join(exceptionsDir, "src"), { recursive: true });
    writeFileSync(
      join(exceptionsDir, "src", "auth.md"),
      `# Auth exceptions

### Hardcoded credentials

**Line:** \`12\`

**Reason:** Password is hardcoded in source and tracked as an accepted risk.
`,
    );
    writeFileSync(
      join(projectDir, "audit", "report.md"),
      `### [Security] Hardcoded credentials
- **Severity**: Critical
- **File**: src/auth.ts:42
- **Details**: Password is hardcoded in source.
- **Suggested fix**: Load from environment.
`,
    );

    const result = applyExceptionFilterToReport();

    expect(result.remainingCount).toBe(0);
    expect(existsSync(join(projectDir, "audit", "report.md"))).toBe(false);
  });

  test("parseChangedExceptionFiles returns only changed exception markdown files", () => {
    const files = parseChangedExceptionFiles([
      " M audit/design/src/auth.md",
      "A  audit/misreads/src/api.md",
      "?? audit/risks/cli/run.md",
      " M audit/report.md",
      " M src/index.ts",
      "R  audit/risks/old/path.md -> audit/risks/new/path.md",
    ]);

    expect(files).toEqual([
      "audit/design/src/auth.md",
      "audit/misreads/src/api.md",
      "audit/risks/cli/run.md",
    ]);
  });

  test("runPipeline aborts when the audit engine fails without a report", async () => {
    const logFile = join(projectDir, "willie.log");
    const engine: Engine = {
      name: "stub",
      model: "stub-model",
      isAvailable: () => true,
      run: async (): Promise<EngineResult> => ({
        success: false,
        output: "auth failed",
        exitCode: 1,
      }),
    };
    const config = {
      softLimitRetries: 0,
      softLimitWait: 0,
    } as Config;

    const signal = await runPipeline(
      ["audit"],
      engine,
      "audit prompt",
      undefined,
      "fix prompt",
      logFile,
      1,
      { retries: 0 },
      config,
    );

    expect(signal).toBe("abort");
    expect(existsSync(join(projectDir, "audit", "report.md"))).toBe(false);
    expect(existsSync(join(projectDir, "iter1-audit.log"))).toBe(false);
    expect(readFileSync(logFile, "utf-8")).toContain(
      "===== Willie iteration 1: audit output =====\nauth failed\n",
    );
  });
});
