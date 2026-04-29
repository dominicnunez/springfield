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
import {
  applyExceptionFilterToReport,
  buildAuditPromptWithExceptions,
  findMatchingException,
  parseAuditReport,
  parseChangedExceptionFiles,
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
      "Before writing audit/report.md, inspect the mirrored exception file for each candidate finding as needed; for src/auth.ts, inspect audit/exceptions/src/auth.md.",
    );
    expect(prompt).toContain(
      "Read only the mirrored exception files and entries needed to rule in or rule out a candidate finding; do not ignore the directory, but avoid loading unrelated exception content.",
    );
  });

  test("lists current exception files without injecting their contents", () => {
    const exceptionsDir = join(projectDir, "audit", "exceptions");
    mkdirSync(join(exceptionsDir, "src"), { recursive: true });
    writeFileSync(
      join(exceptionsDir, "src", "rate-limit.md"),
      "# Exceptions\n\n### Accepted rate limit tradeoff\n**Line:** `12`\nCurrent backoff is intentional.\n",
    );

    const prompt = buildAuditPromptWithExceptions("base audit prompt");

    expect(prompt).toContain("Known exception files:");
    expect(prompt).toContain("audit/exceptions/src/rate-limit.md");
    expect(prompt).toContain(
      "If an exception still applies, suppress that finding instead of re-reporting it.",
    );
    expect(prompt).not.toContain("Accepted rate limit tradeoff");
    expect(prompt).not.toContain("Current backoff is intentional.");
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
    const exceptionsDir = join(projectDir, "audit", "exceptions");
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
    const exceptionsDir = join(projectDir, "audit", "exceptions");
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
    const exceptionsDir = join(projectDir, "audit", "exceptions");
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
    const exceptionsDir = join(projectDir, "audit", "exceptions");
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
      " M audit/exceptions/src/auth.md",
      "A  audit/exceptions/src/api.md",
      "?? audit/exceptions/cli/run.md",
      " M audit/report.md",
      " M src/index.ts",
      "R  audit/exceptions/old/path.md -> audit/exceptions/new/path.md",
    ]);

    expect(files).toEqual([
      "audit/exceptions/cli/run.md",
      "audit/exceptions/src/api.md",
      "audit/exceptions/src/auth.md",
    ]);
  });
});
