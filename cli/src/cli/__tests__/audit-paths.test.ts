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
import { initLogger } from "../../ui/logger.js";
import {
  AUDIT_DIR,
  AUDIT_EXCEPTIONS_DIR,
  AUDIT_PROMPT_FILE,
  AUDIT_REPORT_FILE,
  ensureAuditDirectories,
  exceptionFileForSourceFile,
  listExceptionMarkdownFiles,
  sourceCandidatesForExceptionFile,
} from "../audit-paths.js";

describe("audit paths", () => {
  let originalCwd: string;
  let tempRoot: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempRoot = mkdtempSync(join(tmpdir(), "audit-paths-"));
    process.chdir(tempRoot);
    initLogger({});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    initLogger({});
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("exports canonical audit paths", () => {
    expect(AUDIT_DIR).toBe("audit");
    expect(AUDIT_REPORT_FILE).toBe(join("audit", "report.md"));
    expect(AUDIT_EXCEPTIONS_DIR).toBe(join("audit", "exceptions"));
    expect(AUDIT_PROMPT_FILE).toBe(join("audit", "prompt.md"));
  });

  test("bootstraps audit directories without category templates", () => {
    ensureAuditDirectories();

    expect(existsSync(AUDIT_DIR)).toBe(true);
    expect(existsSync(AUDIT_EXCEPTIONS_DIR)).toBe(true);
    expect(existsSync(join(AUDIT_EXCEPTIONS_DIR, "misreads.md"))).toBe(false);
    expect(existsSync(join(AUDIT_EXCEPTIONS_DIR, "risks.md"))).toBe(false);
    expect(existsSync(join(AUDIT_EXCEPTIONS_DIR, "design.md"))).toBe(false);
  });

  test("maps source files to mirrored markdown exception files", () => {
    expect(exceptionFileForSourceFile("src/auth.ts")).toBe(
      join(AUDIT_EXCEPTIONS_DIR, "src", "auth.md"),
    );
    expect(exceptionFileForSourceFile("src/auth.test.ts")).toBe(
      join(AUDIT_EXCEPTIONS_DIR, "src", "auth.test.md"),
    );
  });

  test("lists exception markdown files recursively", () => {
    mkdirSync(join(AUDIT_EXCEPTIONS_DIR, "src", "cli"), { recursive: true });
    writeFileSync(join(AUDIT_EXCEPTIONS_DIR, "src", "api.md"), "# API");
    writeFileSync(join(AUDIT_EXCEPTIONS_DIR, "src", "cli", "run.md"), "# Run");

    expect(listExceptionMarkdownFiles()).toEqual([
      join(AUDIT_EXCEPTIONS_DIR, "src", "api.md"),
      join(AUDIT_EXCEPTIONS_DIR, "src", "cli", "run.md"),
    ]);
  });

  test("resolves mirrored exception files to source candidates", () => {
    mkdirSync("src", { recursive: true });
    writeFileSync(join("src", "auth.ts"), "export const auth = true;");

    expect(
      sourceCandidatesForExceptionFile(
        join(AUDIT_EXCEPTIONS_DIR, "src", "auth.md"),
      ),
    ).toEqual([join("src", "auth.ts")]);
  });
});
