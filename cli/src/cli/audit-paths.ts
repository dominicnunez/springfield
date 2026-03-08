import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logInfo } from "../ui/logger.js";
import { EXCEPTION_FILE_TEMPLATES } from "./exception-format.js";

export const AUDIT_DIR = "audit";
export const AUDIT_REPORT_FILE = join(AUDIT_DIR, "report.md");
export const AUDIT_EXCEPTIONS_DIR = join(AUDIT_DIR, "exceptions");
export const AUDIT_PROMPT_FILE = join(AUDIT_DIR, "prompt.md");

export function ensureAuditDirectories(): void {
  if (!existsSync(AUDIT_DIR)) {
    mkdirSync(AUDIT_DIR, { recursive: true });
  }

  if (!existsSync(AUDIT_EXCEPTIONS_DIR)) {
    mkdirSync(AUDIT_EXCEPTIONS_DIR, { recursive: true });
    writeFileSync(
      join(AUDIT_EXCEPTIONS_DIR, "misreads.md"),
      EXCEPTION_FILE_TEMPLATES["misreads.md"],
    );
    writeFileSync(
      join(AUDIT_EXCEPTIONS_DIR, "risks.md"),
      EXCEPTION_FILE_TEMPLATES["risks.md"],
    );
    writeFileSync(
      join(AUDIT_EXCEPTIONS_DIR, "design.md"),
      EXCEPTION_FILE_TEMPLATES["design.md"],
    );
    logInfo("Created audit/exceptions/ with template files");
  }
}
