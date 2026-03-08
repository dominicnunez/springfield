import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initLogger } from "../../ui/logger.js";
import {
  AUDIT_DIR,
  AUDIT_EXCEPTIONS_DIR,
  AUDIT_PROMPT_FILE,
  AUDIT_REPORT_FILE,
  ensureAuditDirectories,
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

  test("bootstraps exception template files in the shared directory", () => {
    ensureAuditDirectories();

    expect(existsSync(AUDIT_DIR)).toBe(true);
    expect(existsSync(AUDIT_EXCEPTIONS_DIR)).toBe(true);
    expect(existsSync(join(AUDIT_EXCEPTIONS_DIR, "misreads.md"))).toBe(true);
    expect(existsSync(join(AUDIT_EXCEPTIONS_DIR, "risks.md"))).toBe(true);
    expect(existsSync(join(AUDIT_EXCEPTIONS_DIR, "design.md"))).toBe(true);

    const risksTemplate = readFileSync(
      join(AUDIT_EXCEPTIONS_DIR, "risks.md"),
      "utf-8",
    );
    expect(risksTemplate).toContain("# Risks");
    expect(risksTemplate).toContain("Managed by sfk willie.");
  });
});
