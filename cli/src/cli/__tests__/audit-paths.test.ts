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
  AUDIT_DESIGN_DIR,
  AUDIT_DIR,
  AUDIT_MISREADS_DIR,
  AUDIT_PROMPT_FILE,
  AUDIT_REPORT_FILE,
  AUDIT_RISKS_DIR,
  ensureAuditDirectories,
  exceptionFileForSourceFile,
  exceptionFilesForSourceFile,
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
    expect(AUDIT_DESIGN_DIR).toBe(join("audit", "design"));
    expect(AUDIT_MISREADS_DIR).toBe(join("audit", "misreads"));
    expect(AUDIT_RISKS_DIR).toBe(join("audit", "risks"));
    expect(AUDIT_PROMPT_FILE).toBe(join("audit", "prompt.md"));
  });

  test("bootstraps categorized mirrored exception directories", () => {
    ensureAuditDirectories();

    expect(existsSync(AUDIT_DIR)).toBe(true);
    expect(existsSync(AUDIT_DESIGN_DIR)).toBe(true);
    expect(existsSync(AUDIT_MISREADS_DIR)).toBe(true);
    expect(existsSync(AUDIT_RISKS_DIR)).toBe(true);
  });

  test("maps source files to categorized mirrored markdown files", () => {
    expect(exceptionFileForSourceFile("src/auth.ts", "misreads")).toBe(
      join(AUDIT_MISREADS_DIR, "src", "auth.md"),
    );
    expect(exceptionFileForSourceFile("src/auth.test.ts", "design")).toBe(
      join(AUDIT_DESIGN_DIR, "src", "auth.test.md"),
    );
    expect(exceptionFilesForSourceFile("src/auth.ts")).toEqual([
      join(AUDIT_DESIGN_DIR, "src", "auth.md"),
      join(AUDIT_MISREADS_DIR, "src", "auth.md"),
      join(AUDIT_RISKS_DIR, "src", "auth.md"),
    ]);
  });

  test("lists categorized exception markdown files recursively", () => {
    mkdirSync(join(AUDIT_DESIGN_DIR, "src", "cli"), { recursive: true });
    mkdirSync(join(AUDIT_RISKS_DIR, "src"), { recursive: true });
    writeFileSync(join(AUDIT_RISKS_DIR, "src", "api.md"), "# API");
    writeFileSync(join(AUDIT_DESIGN_DIR, "src", "cli", "run.md"), "# Run");

    expect(listExceptionMarkdownFiles()).toEqual([
      join(AUDIT_DESIGN_DIR, "src", "cli", "run.md"),
      join(AUDIT_RISKS_DIR, "src", "api.md"),
    ]);
  });

  test("resolves categorized mirrored files to source candidates", () => {
    mkdirSync("src", { recursive: true });
    writeFileSync(join("src", "auth.ts"), "export const auth = true;");

    expect(
      sourceCandidatesForExceptionFile(
        join(AUDIT_MISREADS_DIR, "src", "auth.md"),
      ),
    ).toEqual([join("src", "auth.ts")]);
  });
});
