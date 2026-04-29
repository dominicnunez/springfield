import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join, parse, relative } from "node:path";
import { logInfo } from "../ui/logger.js";

export const AUDIT_DIR = "audit";
export const AUDIT_REPORT_FILE = join(AUDIT_DIR, "report.md");
export const AUDIT_EXCEPTIONS_DIR = join(AUDIT_DIR, "exceptions");
export const AUDIT_PROMPT_FILE = join(AUDIT_DIR, "prompt.md");

const MARKDOWN_EXTENSION = ".md";
const PARENT_PATH_PREFIX = "..";

export function ensureAuditDirectories(): void {
  if (!existsSync(AUDIT_DIR)) {
    mkdirSync(AUDIT_DIR, { recursive: true });
  }

  if (!existsSync(AUDIT_EXCEPTIONS_DIR)) {
    mkdirSync(AUDIT_EXCEPTIONS_DIR, { recursive: true });
    logInfo("Created audit/exceptions/");
  }
}

export function exceptionFileForSourceFile(sourceFile: string): string {
  const extension = extname(sourceFile);
  const sourceWithoutExtension = extension
    ? sourceFile.slice(0, -extension.length)
    : sourceFile;

  return join(
    AUDIT_EXCEPTIONS_DIR,
    `${sourceWithoutExtension}${MARKDOWN_EXTENSION}`,
  );
}

export function listExceptionMarkdownFiles(): string[] {
  if (!existsSync(AUDIT_EXCEPTIONS_DIR)) return [];

  return collectMarkdownFiles(AUDIT_EXCEPTIONS_DIR).sort();
}

function collectMarkdownFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(filePath));
    } else if (entry.isFile() && entry.name.endsWith(MARKDOWN_EXTENSION)) {
      files.push(filePath);
    }
  }

  return files;
}

function sourceStemForExceptionFile(exceptionFile: string): string | undefined {
  const relativePath = relative(AUDIT_EXCEPTIONS_DIR, exceptionFile);
  if (!relativePath || relativePath.startsWith(PARENT_PATH_PREFIX)) {
    return undefined;
  }
  if (!relativePath.endsWith(MARKDOWN_EXTENSION)) return undefined;

  return relativePath.slice(0, -MARKDOWN_EXTENSION.length);
}

export function sourceCandidatesForExceptionFile(
  exceptionFile: string,
): string[] {
  const sourceStem = sourceStemForExceptionFile(exceptionFile);
  if (!sourceStem) return [];

  const sourceDir = dirname(sourceStem);
  const sourceBase = basename(sourceStem);
  const searchDir = sourceDir === "." ? "." : sourceDir;
  if (!existsSync(searchDir)) return [];

  return readdirSync(searchDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && parse(entry.name).name === sourceBase)
    .map((entry) => join(searchDir, entry.name))
    .sort();
}
