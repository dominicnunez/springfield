import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import pc from "picocolors";
import type { Config } from "../../config/loader.js";
import { getCurrentModel, getWillieEffort } from "../../config/loader.js";
import {
  DEFAULT_AUDIT_PROMPT,
  type Engine,
  type EngineResult,
  generateFixPrompt,
  VALIDATE_PROMPT,
} from "../../engines/base.js";
import { ClaudeEngine } from "../../engines/claude.js";
import { CodexEngine } from "../../engines/codex.js";
import { OpenCodeEngine } from "../../engines/opencode.js";
import { handleSoftRateLimit } from "../../engines/rate-limit.js";
import {
  detectLintCommand,
  detectTestCommand,
} from "../../tasks/verification.js";
import {
  formatDivider,
  logDebug,
  logError,
  logInfo,
  logSuccess,
  logWarning,
} from "../../ui/logger.js";
import { EXCEPTION_FILE_TEMPLATES } from "../exception-format.js";
import { parseExceptionFile } from "./prune.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type AuditStep = "audit" | "validate" | "fix";

const STEP_ORDER: AuditStep[] = ["audit", "validate", "fix"];

interface SoftLimitState {
  retries: number;
}

type PipelineSignal = "continue" | "stop" | "retry" | "abort";

export interface AuditOptions {
  startStep: AuditStep;
  maxIterations: number; // 0 = unlimited
  auditPromptPath: string | undefined;
  lintCmd: string | undefined;
  verbose?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const AUDIT_DIR = "audit";
const REPORT_FILE = join(AUDIT_DIR, "report.md");
const EXCEPTIONS_DIR = join(AUDIT_DIR, "exceptions");
const ENGINE_CLI_NAMES: Record<string, string> = {
  claude: "Claude CLI",
  codex: "Codex CLI",
  opencode: "OpenCode CLI",
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function notify(message: string): void {
  try {
    const result = spawnSync("which", ["openclaw"], { encoding: "utf-8" });
    if (result.status === 0) {
      spawnSync("openclaw", ["cron", "wake", message], {
        encoding: "utf-8",
        stdio: "ignore",
      });
    }
  } catch (err) {
    logDebug(`Notification failed: ${err}`);
  }
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

function ensureAuditDir(): void {
  if (!existsSync(AUDIT_DIR)) {
    mkdirSync(AUDIT_DIR, { recursive: true });
  }
  if (!existsSync(EXCEPTIONS_DIR)) {
    mkdirSync(EXCEPTIONS_DIR, { recursive: true });
    writeFileSync(
      join(EXCEPTIONS_DIR, "misreads.md"),
      EXCEPTION_FILE_TEMPLATES["misreads.md"],
    );
    writeFileSync(
      join(EXCEPTIONS_DIR, "risks.md"),
      EXCEPTION_FILE_TEMPLATES["risks.md"],
    );
    writeFileSync(
      join(EXCEPTIONS_DIR, "design.md"),
      EXCEPTION_FILE_TEMPLATES["design.md"],
    );
    logInfo("Created audit/exceptions/ with template files");
  }
}

function extractFindingFiles(reportPath: string): Set<string> {
  if (!existsSync(reportPath)) return new Set();
  const content = readFileSync(reportPath, "utf-8");
  const files = new Set<string>();
  for (const match of content.matchAll(/^- \*\*File\*\*:\s*(\S+)/gm)) {
    files.add(match[1].split(":")[0]);
  }
  return files;
}

function readMatchingExceptions(findingFiles: Set<string>): string {
  if (!existsSync(EXCEPTIONS_DIR) || findingFiles.size === 0) return "";
  const mdFiles = readdirSync(EXCEPTIONS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
  const matched: string[] = [];
  for (const file of mdFiles) {
    const filePath = join(EXCEPTIONS_DIR, file);
    const content = readFileSync(filePath, "utf-8").trim();
    const parsed = parseExceptionFile(filePath, content);
    for (const entry of parsed.entries) {
      if (entry.location && findingFiles.has(entry.location)) {
        matched.push(entry.rawText);
      }
    }
  }
  return matched.join("\n\n");
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

interface ResolvedPrompt {
  text: string;
  source: string;
}

function resolveAuditPrompt(
  auditPromptPath: string | undefined,
): ResolvedPrompt {
  if (auditPromptPath && existsSync(auditPromptPath)) {
    return {
      text: readFileSync(auditPromptPath, "utf-8"),
      source: auditPromptPath,
    };
  }

  const projectPrompt = join(AUDIT_DIR, "prompt.md");
  if (existsSync(projectPrompt)) {
    return {
      text: readFileSync(projectPrompt, "utf-8"),
      source: projectPrompt,
    };
  }

  const globalPrompt = join(homedir(), ".config", "sfk", "audit-prompt.md");
  if (existsSync(globalPrompt)) {
    return { text: readFileSync(globalPrompt, "utf-8"), source: globalPrompt };
  }

  return { text: DEFAULT_AUDIT_PROMPT, source: "built-in default" };
}

// ─────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────

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

  const result = await engine.run(auditPrompt);
  logToFile(logDir, iter, "audit", result.output);

  if (checkRateLimited(result))
    return { result: "rate-limited", matchedExceptions: "" };

  if (!result.success) {
    logWarning(
      `${engine.name} exited with code ${result.exitCode} for audit step`,
    );
  }

  if (!existsSync(REPORT_FILE)) {
    logSuccess("No audit/report.md generated — codebase is clean!");
    return { result: "stop", matchedExceptions: "" };
  }

  const findingCount = countFindings(REPORT_FILE);
  if (findingCount === 0) {
    logSuccess("Audit report has no findings. Cleaning up.");
    unlinkSync(REPORT_FILE);
    return { result: "stop", matchedExceptions: "" };
  }

  logInfo(`Audit found ${findingCount} issue(s).`);

  const findingFiles = extractFindingFiles(REPORT_FILE);
  const matchedExceptions = readMatchingExceptions(findingFiles);

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

  if (!existsSync(REPORT_FILE)) {
    logInfo("All findings were false positives.");
    return "ok";
  }

  const remaining = countFindings(REPORT_FILE);
  logInfo(`${remaining} validated finding(s) remain.`);

  if (remaining === 0) {
    unlinkSync(REPORT_FILE);
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
  if (!existsSync(REPORT_FILE)) {
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

  if (!existsSync(REPORT_FILE)) {
    logInfo("All issues resolved.");
  } else {
    const remaining = countFindings(REPORT_FILE);
    if (remaining > 0) {
      logWarning(`${remaining} finding(s) remain after fix step.`);
    }
  }

  return "ok";
}

// ─────────────────────────────────────────────────────────────
// Pipeline
// ─────────────────────────────────────────────────────────────

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
  if (engine.switchToFallback?.()) {
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

// ─────────────────────────────────────────────────────────────
// Main audit loop
// ─────────────────────────────────────────────────────────────

export async function auditLoop(
  config: Config,
  options: AuditOptions,
): Promise<void> {
  const projectName = basename(process.cwd());
  const logDir = join(config.logDir, `willie-${projectName}`);

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const model = getCurrentModel(config);
  const effort = getWillieEffort(config);

  let engine: Engine;
  if (config.engine === "opencode") {
    engine = new OpenCodeEngine(model, config.ocFallModel);
  } else if (config.engine === "codex") {
    engine = new CodexEngine(model === "default" ? undefined : model);
  } else {
    engine = new ClaudeEngine(model, effort);
  }

  if (!engine.isAvailable()) {
    const cliName = ENGINE_CLI_NAMES[engine.name] ?? `${engine.name} CLI`;
    logError(`'${engine.name}' command not found. Willie requires ${cliName}.`);
    process.exitCode = 1;
    return;
  }

  // Resolve audit prompt (CLI flag > project file > global file > built-in default)
  const resolved = resolveAuditPrompt(options.auditPromptPath);
  const auditPrompt = resolved.text;

  // Resolve lint and test commands
  const lintCmd = options.lintCmd ?? config.lintCmd ?? detectLintCommand();
  const testCmd = config.testCmd ?? detectTestCommand();
  const fixPrompt = generateFixPrompt({ testCmd, lintCmd });

  // Ensure audit/ directory and exceptions template exist
  ensureAuditDir();

  const maxStr =
    options.maxIterations > 0 ? String(options.maxIterations) : "unlimited";

  console.log("");
  console.log(pc.cyan(formatDivider("Willie Starting")));
  console.log(`Project: ${projectName}`);
  console.log(`Start step: ${options.startStep}`);
  console.log(`Max iterations: ${maxStr}`);
  console.log(`Model: ${model} (effort: ${effort})`);
  console.log(`Audit prompt: ${resolved.source}`);
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
