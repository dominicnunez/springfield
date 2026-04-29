import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join, parse, relative } from "node:path";
import { logInfo } from "../ui/logger.js";

export const AUDIT_DIR = "audit";
export const AUDIT_REPORT_FILE = join(AUDIT_DIR, "report.md");
export const AUDIT_DESIGN_DIR = join(AUDIT_DIR, "design");
export const AUDIT_MISREADS_DIR = join(AUDIT_DIR, "misreads");
export const AUDIT_RISKS_DIR = join(AUDIT_DIR, "risks");
export const AUDIT_PROMPT_FILE = join(AUDIT_DIR, "prompt.md");

export type AuditExceptionCategory = "design" | "misreads" | "risks";

export const AUDIT_EXCEPTION_DIRS: readonly string[] = [
  AUDIT_DESIGN_DIR,
  AUDIT_MISREADS_DIR,
  AUDIT_RISKS_DIR,
];

const MARKDOWN_EXTENSION = ".md";
const PARENT_PATH_PREFIX = "..";

export function ensureAuditDirectories(): void {
  if (!existsSync(AUDIT_DIR)) {
    mkdirSync(AUDIT_DIR, { recursive: true });
  }

  for (const dir of AUDIT_EXCEPTION_DIRS) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logInfo(`Created ${dir}/`);
    }
  }
}

function exceptionDirForCategory(category: AuditExceptionCategory): string {
  if (category === "design") return AUDIT_DESIGN_DIR;
  if (category === "misreads") return AUDIT_MISREADS_DIR;
  return AUDIT_RISKS_DIR;
}

export function exceptionFileForSourceFile(
  sourceFile: string,
  category: AuditExceptionCategory,
): string {
  const extension = extname(sourceFile);
  const sourceWithoutExtension = extension
    ? sourceFile.slice(0, -extension.length)
    : sourceFile;

  return join(
    exceptionDirForCategory(category),
    `${sourceWithoutExtension}${MARKDOWN_EXTENSION}`,
  );
}

export function exceptionFilesForSourceFile(sourceFile: string): string[] {
  return [
    exceptionFileForSourceFile(sourceFile, "design"),
    exceptionFileForSourceFile(sourceFile, "misreads"),
    exceptionFileForSourceFile(sourceFile, "risks"),
  ];
}

export function listExceptionMarkdownFiles(): string[] {
  return AUDIT_EXCEPTION_DIRS.flatMap((dir) => {
    if (!existsSync(dir)) return [];
    return collectMarkdownFiles(dir);
  }).sort();
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
  for (const dir of AUDIT_EXCEPTION_DIRS) {
    const relativePath = relative(dir, exceptionFile);
    if (!relativePath || relativePath.startsWith(PARENT_PATH_PREFIX)) {
      continue;
    }
    if (!relativePath.endsWith(MARKDOWN_EXTENSION)) continue;

    return relativePath.slice(0, -MARKDOWN_EXTENSION.length);
  }

  return undefined;
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
