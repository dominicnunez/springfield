import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import type { Config } from "../../config/loader.js";
import {
  DEFAULT_AUDIT_PROMPT,
  type Engine,
  type EngineResult,
  VALIDATE_PROMPT,
} from "../../engines/base.js";
import { handleSoftRateLimit } from "../../engines/rate-limit.js";
import {
  formatDivider,
  logError,
  logInfo,
  logSuccess,
  logWarning,
} from "../../ui/logger.js";
import {
  AUDIT_EXCEPTIONS_DIR,
  AUDIT_REPORT_FILE,
  exceptionFileForSourceFile,
  listExceptionMarkdownFiles,
} from "../audit-paths.js";
import { initializeAuditSession } from "../audit-session.js";
import { switchToFallbackWithNotice } from "../engine-fallback.js";
import { runGitLines } from "../git.js";
import { notify } from "../notify.js";
import { type ExceptionEntry, parseExceptionFile } from "./prune.js";

export type AuditStep = "audit" | "validate" | "fix";

const STEP_ORDER: AuditStep[] = ["audit", "validate", "fix"];

interface SoftLimitState {
  retries: number;
}

export interface AuditFinding {
  category: string;
  title: string;
  severity: string;
  file: string;
  details: string;
  suggestedFix: string;
  rawText: string;
}

export interface ReportFilterResult {
  originalCount: number;
  suppressedCount: number;
  remainingCount: number;
}

type PipelineSignal = "continue" | "stop" | "retry" | "abort";

export interface AuditOptions {
  startStep: AuditStep;
  maxIterations: number;
  auditPromptPath: string | undefined;
  lintCmd: string | undefined;
  verbose?: boolean;
}

const EXCEPTION_PATHSPEC = "audit/exceptions";

export function parseChangedExceptionFiles(statusLines: string[]): string[] {
  const files = new Set<string>();

  for (const line of statusLines) {
    if (!line || line.length < 4) continue;

    const file = line.slice(3).trim();
    if (file.includes(" -> ")) continue;
    if (!file.startsWith(`${EXCEPTION_PATHSPEC}/`) || !file.endsWith(".md")) {
      continue;
    }

    files.add(file);
  }

  return [...files].sort();
}

function runGit(args: string[]): { ok: boolean; stderr: string } {
  const result = spawnSync("git", args, {
    encoding: "utf-8",
    cwd: process.cwd(),
  });

  return {
    ok: !result.error && result.status === 0,
    stderr: result.stderr?.trim() ?? result.error?.message ?? "",
  };
}

function commitExceptionFilesIfChanged(): void {
  const statusLines = runGitLines(
    ["status", "--porcelain", "--", EXCEPTION_PATHSPEC],
    "git status (exceptions)",
  );
  const changedFiles = parseChangedExceptionFiles(statusLines);

  if (changedFiles.length === 0) return;

  const addResult = runGit(["add", "--", ...changedFiles]);
  if (!addResult.ok) {
    logWarning(
      `Failed to stage exception updates: ${addResult.stderr || "unknown error"}`,
    );
    return;
  }

  const stagedLines = runGitLines(
    ["diff", "--cached", "--name-only", "--", EXCEPTION_PATHSPEC],
    "git diff --cached (exceptions)",
  );
  const stagedFiles = stagedLines.filter((f) => f.endsWith(".md"));
  if (stagedFiles.length === 0) return;

  const commitResult = runGit([
    "commit",
    "-m",
    "docs(audit): update exception records",
    "--",
    ...stagedFiles,
  ]);

  if (commitResult.ok) {
    logInfo(`Committed ${stagedFiles.length} exception file(s).`);
    return;
  }

  logWarning(
    `Failed to commit exception updates: ${commitResult.stderr || "unknown error"}`,
  );
}

function countFindings(reportPath: string): number {
  if (!existsSync(reportPath)) return 0;
  const content = readFileSync(reportPath, "utf-8");

  const bracketMatches = content.match(/### \[/g);
  if (bracketMatches) return bracketMatches.length;

  const plainMatches = content.match(
    /### (Security|Bug|Performance|Code Quality|Error Handling|Configuration|Reliability)/gi,
  );
  if (plainMatches) return plainMatches.length;

  const severityMatches = content.match(/\*\*(Critical|High|Medium|Low)\*\*/gi);
  if (severityMatches) return severityMatches.length;

  return 0;
}

export function parseAuditReport(content: string): AuditFinding[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const blocks = trimmed.split(/\n(?=### )/g).filter(Boolean);
  const findings: AuditFinding[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const headingMatch = lines[0].match(/^### \[([^\]]+)\]\s+(.+)$/);
    if (!headingMatch) continue;

    const severity = extractReportField(block, "Severity");
    const file = normalizeFilePath(extractReportField(block, "File"));
    const details = extractReportField(block, "Details");
    const suggestedFix = extractReportField(block, "Suggested fix");

    if (!severity || !file || !details || !suggestedFix) continue;

    findings.push({
      category: headingMatch[1].trim(),
      title: headingMatch[2].trim(),
      severity,
      file,
      details,
      suggestedFix,
      rawText: block.trim(),
    });
  }

  return findings;
}

function extractReportField(block: string, field: string): string {
  const match = block.match(
    new RegExp(`^- \\*\\*${escapeRegExp(field)}\\*\\*:\\s*(.+)$`, "m"),
  );
  return match?.[1]?.trim() ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFilePath(file: string): string {
  return file.split(":")[0].trim();
}

function loadExceptionEntriesFromFile(filePath: string): ExceptionEntry[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return [];

  return parseExceptionFile(filePath, content).entries;
}

function loadExceptionEntriesForSourceFile(
  sourceFile: string,
): ExceptionEntry[] {
  return loadExceptionEntriesFromFile(exceptionFileForSourceFile(sourceFile));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_#[\](){}:;,.!?/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

function textSimilar(a: string, b: string): boolean {
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);
  if (!normalizedA || !normalizedB) return false;

  const shorter =
    normalizedA.length <= normalizedB.length ? normalizedA : normalizedB;
  const longer = shorter === normalizedA ? normalizedB : normalizedA;
  if (shorter.length >= 12 && longer.includes(shorter)) return true;

  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return false;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap++;
  }

  const shorterSize = Math.min(tokensA.size, tokensB.size);
  return overlap >= 3 && overlap / shorterSize >= 0.6;
}

export function findMatchingException(
  finding: AuditFinding,
  entries: ExceptionEntry[] = loadExceptionEntriesForSourceFile(finding.file),
): ExceptionEntry | undefined {
  return entries.find((entry) => {
    return (
      textSimilar(finding.title, entry.heading) ||
      textSimilar(finding.details, entry.heading) ||
      textSimilar(finding.title, entry.rawText) ||
      textSimilar(finding.details, entry.rawText)
    );
  });
}

function rebuildAuditReport(findings: AuditFinding[]): string {
  return `${findings.map((finding) => finding.rawText).join("\n\n")}\n`;
}

function collectExceptionsForFindingFiles(findingFiles: Set<string>): string {
  if (findingFiles.size === 0) return "";
  const matched: string[] = [];

  for (const file of [...findingFiles].sort()) {
    matched.push(
      ...loadExceptionEntriesForSourceFile(file).map((entry) => entry.rawText),
    );
  }

  return matched.join("\n\n");
}

export function applyExceptionFilterToReport(): ReportFilterResult {
  if (!existsSync(AUDIT_REPORT_FILE)) {
    return { originalCount: 0, suppressedCount: 0, remainingCount: 0 };
  }

  const content = readFileSync(AUDIT_REPORT_FILE, "utf-8");
  const findings = parseAuditReport(content);
  if (findings.length === 0) {
    return { originalCount: 0, suppressedCount: 0, remainingCount: 0 };
  }

  const entriesBySourceFile = new Map<string, ExceptionEntry[]>();
  const getEntries = (sourceFile: string): ExceptionEntry[] => {
    const cached = entriesBySourceFile.get(sourceFile);
    if (cached) return cached;

    const entries = loadExceptionEntriesForSourceFile(sourceFile);
    entriesBySourceFile.set(sourceFile, entries);
    return entries;
  };
  const remainingFindings = findings.filter(
    (finding) => !findMatchingException(finding, getEntries(finding.file)),
  );

  if (remainingFindings.length === 0) {
    unlinkSync(AUDIT_REPORT_FILE);
  } else if (remainingFindings.length !== findings.length) {
    writeFileSync(AUDIT_REPORT_FILE, rebuildAuditReport(remainingFindings));
  }

  return {
    originalCount: findings.length,
    suppressedCount: findings.length - remainingFindings.length,
    remainingCount: remainingFindings.length,
  };
}

export function buildAuditPromptWithExceptions(auditPrompt: string): string {
  const instructions = [
    "Before writing audit/report.md, inspect the mirrored exception file for each candidate finding as needed; for src/auth.ts, inspect audit/exceptions/src/auth.md.",
    "Read only the mirrored exception files and entries needed to rule in or rule out a candidate finding; do not ignore the directory, but avoid loading unrelated exception content.",
    "Exception entries use **Line:** only because the mirrored exception file path identifies the source file.",
    "Do not write findings that are already covered by an existing exception unless the exception is clearly stale because the code has materially changed.",
    "If an exception still applies, suppress that finding instead of re-reporting it.",
  ].join(" ");
  if (!existsSync(AUDIT_EXCEPTIONS_DIR)) {
    return `${auditPrompt}\n\n${instructions}`;
  }

  const mdFiles = listExceptionMarkdownFiles();
  const exceptionFileList =
    mdFiles.length > 0 ? mdFiles.join("\n") : `${AUDIT_EXCEPTIONS_DIR}/**/*.md`;

  return `${auditPrompt}\n\n${instructions}\n\nKnown exception files:\n${exceptionFileList}`;
}

function logToFile(
  logDir: string,
  iter: number,
  step: string,
  output: string,
): void {
  const logFile = join(logDir, `iter${iter}-${step}.log`);
  try {
    appendFileSync(logFile, output);
  } catch (err) {
    logWarning(`Failed to write log to ${logFile}: ${err}`);
  }
}

type AuditStepResult = "continue" | "stop" | "rate-limited";
type StepResult = "ok" | "rate-limited";

interface AuditStepOutput {
  result: AuditStepResult;
  matchedExceptions: string;
}

function checkRateLimited(result: EngineResult): boolean {
  return !!(result.softRateLimited || result.hardRateLimited);
}

async function runAuditStep(
  engine: Engine,
  auditPrompt: string,
  logDir: string,
  iter: number,
): Promise<AuditStepOutput> {
  logInfo("Step 1: Running audit...");

  const prompt = buildAuditPromptWithExceptions(auditPrompt);
  const result = await engine.run(prompt);
  logToFile(logDir, iter, "audit", result.output);

  if (checkRateLimited(result))
    return { result: "rate-limited", matchedExceptions: "" };

  if (!result.success) {
    logWarning(
      `${engine.name} exited with code ${result.exitCode} for audit step`,
    );
  }

  if (!existsSync(AUDIT_REPORT_FILE)) {
    logSuccess("No audit/report.md generated — codebase is clean!");
    return { result: "stop", matchedExceptions: "" };
  }

  const findingCount = countFindings(AUDIT_REPORT_FILE);
  if (findingCount === 0) {
    logSuccess("Audit report has no findings. Cleaning up.");
    unlinkSync(AUDIT_REPORT_FILE);
    return { result: "stop", matchedExceptions: "" };
  }

  const filterResult = applyExceptionFilterToReport();
  logInfo(`Audit found ${filterResult.originalCount} issue(s).`);
  if (filterResult.suppressedCount > 0) {
    logInfo(
      `Suppressed ${filterResult.suppressedCount} finding(s) already covered by exceptions.`,
    );
  }

  if (filterResult.remainingCount === 0) {
    logSuccess("All audit findings were already covered by exceptions.");
    return { result: "stop", matchedExceptions: "" };
  }

  logInfo(
    `${filterResult.remainingCount} issue(s) remain after exception filtering.`,
  );

  const findingFiles = new Set(
    parseAuditReport(readFileSync(AUDIT_REPORT_FILE, "utf-8")).map(
      (finding) => finding.file,
    ),
  );
  const matchedExceptions = collectExceptionsForFindingFiles(findingFiles);

  return { result: "continue", matchedExceptions };
}

async function runValidateStep(
  engine: Engine,
  matchedExceptions: string,
  logDir: string,
  iter: number,
): Promise<StepResult> {
  logInfo("Step 2: Validating findings...");

  const prompt = matchedExceptions
    ? `${VALIDATE_PROMPT}\n\n--- KNOWN EXCEPTIONS (already classified) ---\n${matchedExceptions}\n--- END KNOWN EXCEPTIONS ---`
    : VALIDATE_PROMPT;

  const result = await engine.run(prompt);
  logToFile(logDir, iter, "validate", result.output);

  if (checkRateLimited(result)) return "rate-limited";

  if (!result.success) {
    logWarning(
      `${engine.name} exited with code ${result.exitCode} for validate step`,
    );
  }

  if (!existsSync(AUDIT_REPORT_FILE)) {
    logInfo("All findings were false positives.");
    return "ok";
  }

  const remaining = countFindings(AUDIT_REPORT_FILE);
  logInfo(`${remaining} validated finding(s) remain.`);

  if (remaining === 0) {
    unlinkSync(AUDIT_REPORT_FILE);
    logInfo("Report empty after validation.");
  }

  return "ok";
}

async function runFixStep(
  engine: Engine,
  fixPrompt: string,
  logDir: string,
  iter: number,
): Promise<StepResult> {
  if (!existsSync(AUDIT_REPORT_FILE)) {
    logInfo("No audit report to fix. Skipping step 3.");
    return "ok";
  }

  logInfo("Step 3: Fixing issues...");

  const result = await engine.run(fixPrompt);
  logToFile(logDir, iter, "fix", result.output);

  if (checkRateLimited(result)) return "rate-limited";

  if (!result.success) {
    logWarning(
      `${engine.name} exited with code ${result.exitCode} for fix step`,
    );
  }

  if (!existsSync(AUDIT_REPORT_FILE)) {
    logInfo("All issues resolved.");
  } else {
    const remaining = countFindings(AUDIT_REPORT_FILE);
    if (remaining > 0) {
      logWarning(`${remaining} finding(s) remain after fix step.`);
    }
  }

  return "ok";
}

type RateLimitResult<T> =
  | { signal: "ok"; result: T }
  | { signal: "retry" | "abort" };

async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  isRateLimited: (result: T) => boolean,
  state: SoftLimitState,
  config: Config,
  engine: Engine,
): Promise<RateLimitResult<T>> {
  const result = await fn();
  if (!isRateLimited(result)) {
    state.retries = 0;
    return { signal: "ok", result };
  }

  if (
    await handleSoftRateLimit(
      state.retries,
      config.softLimitRetries,
      config.softLimitWait,
    )
  ) {
    state.retries++;
    return { signal: "retry" };
  }

  state.retries = 0;
  if (switchToFallbackWithNotice(engine)) {
    return { signal: "retry" };
  }

  logError("Rate limit persisted, no fallback available");
  process.exitCode = 1;
  return { signal: "abort" };
}

async function runPipeline(
  steps: AuditStep[],
  engine: Engine,
  auditPrompt: string,
  fixPrompt: string,
  logDir: string,
  iter: number,
  state: SoftLimitState,
  config: Config,
): Promise<PipelineSignal> {
  let matchedExceptions = "";

  for (const step of steps) {
    switch (step) {
      case "audit": {
        const r = await withRateLimitRetry(
          () => runAuditStep(engine, auditPrompt, logDir, iter),
          (o) => o.result === "rate-limited",
          state,
          config,
          engine,
        );
        if (r.signal !== "ok") return r.signal;
        if (r.result.result === "stop") return "stop";
        matchedExceptions = r.result.matchedExceptions;
        break;
      }
      case "validate": {
        const r = await withRateLimitRetry(
          () => runValidateStep(engine, matchedExceptions, logDir, iter),
          (o) => o === "rate-limited",
          state,
          config,
          engine,
        );
        if (r.signal !== "ok") return r.signal;
        break;
      }
      case "fix": {
        const r = await withRateLimitRetry(
          () => runFixStep(engine, fixPrompt, logDir, iter),
          (o) => o === "rate-limited",
          state,
          config,
          engine,
        );
        if (r.signal !== "ok") return r.signal;
        break;
      }
    }
  }

  return "continue";
}

export async function auditLoop(
  config: Config,
  options: AuditOptions,
): Promise<void> {
  const session = initializeAuditSession(config, options, DEFAULT_AUDIT_PROMPT);
  if (!session) {
    process.exitCode = 1;
    return;
  }

  const {
    projectName,
    logDir,
    model,
    effort,
    engine,
    auditPrompt,
    auditPromptSource,
    lintCmd,
    testCmd,
    fixPrompt,
  } = session;

  const maxStr =
    options.maxIterations > 0 ? String(options.maxIterations) : "unlimited";

  console.log("");
  console.log(pc.cyan(formatDivider("Willie Starting")));
  console.log(`Project: ${projectName}`);
  console.log(`Start step: ${options.startStep}`);
  console.log(`Max iterations: ${maxStr}`);
  console.log(`Model: ${model} (effort: ${effort})`);
  console.log(`Audit prompt: ${auditPromptSource}`);
  console.log(`Lint command: ${lintCmd ?? "none detected"}`);
  console.log(`Test command: ${testCmd ?? "none detected"}`);

  let iter = 0;
  const rateLimitState: SoftLimitState = { retries: 0 };
  let skipToIndex = STEP_ORDER.indexOf(options.startStep);

  while (true) {
    iter++;

    if (options.maxIterations > 0 && iter > options.maxIterations) {
      logInfo(`Reached max iterations (${options.maxIterations}). Stopping.`);
      notify(
        `Willie: reached iteration cap (${options.maxIterations}) on ${projectName}. NOT converged — issues may remain.`,
      );
      process.exitCode = 3;
      break;
    }

    console.log("");
    console.log(pc.cyan(formatDivider(`Iteration ${iter}`)));

    const steps = STEP_ORDER.slice(skipToIndex);
    skipToIndex = 0;

    const signal = await runPipeline(
      steps,
      engine,
      auditPrompt,
      fixPrompt,
      logDir,
      iter,
      rateLimitState,
      config,
    );

    if (signal === "abort") return;
    if (signal === "retry") {
      iter--;
      continue;
    }

    commitExceptionFilesIfChanged();

    if (signal === "stop") {
      notify(
        `Willie: codebase clean after ${iter} iteration(s) on ${projectName}. No findings.`,
      );
      break;
    }
  }

  console.log("");
  console.log(pc.cyan(formatDivider("Willie Complete")));
  console.log(`Total iterations: ${iter}`);
  console.log(`Logs: ${logDir}/`);
}
