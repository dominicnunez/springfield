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
import { getWillieEffort, getWillieModel } from "../../config/loader.js";
import {
  DEFAULT_AUDIT_PROMPT,
  type Engine,
  type EngineResult,
  generateFixPrompt,
  VALIDATE_PROMPT,
} from "../../engines/base.js";
import { ClaudeEngine } from "../../engines/claude.js";
import { OpenCodeEngine } from "../../engines/opencode.js";
import { handleSoftRateLimit } from "../../engines/rate-limit.js";
import {
  detectLintCommand,
  detectTestCommand,
} from "../../tasks/verification.js";
import {
  logDebug,
  logError,
  logInfo,
  logSuccess,
  logWarning,
} from "../../ui/logger.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type AuditStep = "audit" | "validate" | "fix";

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

const ENTRY_FORMAT = `>
> Entry format:
> ### Plain language description
> **Location:** \`file/path:line\` — optional context
> **Date:** YYYY-MM-DD
> **Reason:** Explanation (can be multiple lines)`;

const MISREADS_TEMPLATE = `# Misreads

> Findings where the audit misread the code or described behavior that doesn't occur.
> Managed by sfk willie. Follow the entry format below.
${ENTRY_FORMAT}
`;

const RISKS_TEMPLATE = `# Risks

> Real findings consciously accepted — architectural cost, external constraints, disproportionate effort.
> Managed by sfk willie. Follow the entry format below.
${ENTRY_FORMAT}
`;

const DESIGN_TEMPLATE = `# Design

> Findings that describe behavior which is correct by design.
> Managed by sfk willie. Follow the entry format below.
${ENTRY_FORMAT}
`;

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
    writeFileSync(join(EXCEPTIONS_DIR, "misreads.md"), MISREADS_TEMPLATE);
    writeFileSync(join(EXCEPTIONS_DIR, "risks.md"), RISKS_TEMPLATE);
    writeFileSync(join(EXCEPTIONS_DIR, "design.md"), DESIGN_TEMPLATE);
    logInfo("Created audit/exceptions/ with template files");
  }
}

function readExceptions(): string {
  if (!existsSync(EXCEPTIONS_DIR)) return "";

  const files = readdirSync(EXCEPTIONS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (files.length === 0) return "";

  const parts: string[] = [];
  for (const file of files) {
    const content = readFileSync(join(EXCEPTIONS_DIR, file), "utf-8").trim();
    if (content) parts.push(content);
  }

  return parts.join("\n\n");
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

function checkRateLimited(result: EngineResult): boolean {
  return !!(result.softRateLimited || result.hardRateLimited);
}

async function runAuditStep(
  engine: Engine,
  auditPrompt: string,
  logDir: string,
  iter: number,
): Promise<AuditStepResult> {
  logInfo("STEP 1: Running audit...");

  const exceptions = readExceptions();
  const fullPrompt = exceptions
    ? `${auditPrompt}\n\n--- KNOWN EXCEPTIONS (do not re-flag) ---\n${exceptions}\n--- END KNOWN EXCEPTIONS ---`
    : auditPrompt;

  const result = await engine.run(fullPrompt);
  logToFile(logDir, iter, "audit", result.output);

  if (checkRateLimited(result)) return "rate-limited";

  if (!result.success) {
    logWarning(`Claude exited with code ${result.exitCode} for audit step`);
  }

  if (!existsSync(REPORT_FILE)) {
    logSuccess("No audit/report.md generated — codebase is clean!");
    return "stop";
  }

  const findingCount = countFindings(REPORT_FILE);
  if (findingCount === 0) {
    logSuccess("Audit report has no findings. Cleaning up.");
    unlinkSync(REPORT_FILE);
    return "stop";
  }

  logInfo(`Audit found ${findingCount} issue(s).`);
  return "continue";
}

async function runValidateStep(
  engine: Engine,
  logDir: string,
  iter: number,
): Promise<StepResult> {
  logInfo("STEP 2: Validating findings...");

  const result = await engine.run(VALIDATE_PROMPT);
  logToFile(logDir, iter, "validate", result.output);

  if (checkRateLimited(result)) return "rate-limited";

  if (!result.success) {
    logWarning(`Claude exited with code ${result.exitCode} for validate step`);
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

  logInfo("STEP 3: Fixing issues...");

  const result = await engine.run(fixPrompt);
  logToFile(logDir, iter, "fix", result.output);

  if (checkRateLimited(result)) return "rate-limited";

  if (!result.success) {
    logWarning(`Claude exited with code ${result.exitCode} for fix step`);
  }

  if (!existsSync(REPORT_FILE)) {
    logSuccess("All issues resolved.");
  } else {
    const remaining = countFindings(REPORT_FILE);
    if (remaining > 0) {
      logWarning(`${remaining} finding(s) remain after fix step.`);
    }
  }

  return "ok";
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

  const model = getWillieModel(config);
  const effort = getWillieEffort(config);

  let engine: Engine;
  if (config.engine === "opencode") {
    engine = new OpenCodeEngine(model, config.ocFallModel);
  } else {
    engine = new ClaudeEngine(model, effort);
  }

  if (!engine.isAvailable()) {
    const engineName = config.engine === "opencode" ? "opencode" : "claude";
    logError(
      `'${engineName}' command not found. Willie requires ${engineName} CLI.`,
    );
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
  console.log(pc.cyan("=== Willie Starting ==="));
  console.log(`  Project: ${projectName}`);
  console.log(`  Start step: ${options.startStep}`);
  console.log(`  Max iterations: ${maxStr}`);
  console.log(`  Model: ${model} (effort: ${effort})`);
  console.log(`  Audit prompt: ${resolved.source}`);
  console.log(`  Lint command: ${lintCmd ?? "none detected"}`);
  console.log(`  Test command: ${testCmd ?? "none detected"}`);
  console.log("");

  let iter = 0;
  let firstIter = true;
  let softLimitRetries = 0;

  async function handleRateLimit(): Promise<boolean> {
    if (
      await handleSoftRateLimit(
        softLimitRetries,
        config.softLimitRetries,
        config.softLimitWait,
      )
    ) {
      softLimitRetries++;
      iter--;
      return true;
    }

    softLimitRetries = 0;
    if (engine.switchToFallback?.()) {
      iter--;
      return true;
    }

    logError("Rate limit persisted, no fallback available");
    process.exitCode = 1;
    return false;
  }

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
    console.log(pc.cyan(`========== ITERATION ${iter} ==========`));

    if (firstIter) {
      firstIter = false;

      switch (options.startStep) {
        case "audit": {
          const auditResult = await runAuditStep(
            engine,
            auditPrompt,
            logDir,
            iter,
          );
          if (auditResult === "rate-limited") {
            if (await handleRateLimit()) continue;
            return;
          }
          if (auditResult === "stop") {
            notify(
              `Willie: codebase clean after ${iter} iteration(s) on ${projectName}. No findings.`,
            );
            break;
          }
          softLimitRetries = 0;

          const valResult = await runValidateStep(engine, logDir, iter);
          if (valResult === "rate-limited") {
            if (await handleRateLimit()) continue;
            return;
          }
          softLimitRetries = 0;

          const fixResult = await runFixStep(engine, fixPrompt, logDir, iter);
          if (fixResult === "rate-limited") {
            if (await handleRateLimit()) continue;
            return;
          }
          softLimitRetries = 0;
          continue;
        }
        case "validate": {
          const valResult = await runValidateStep(engine, logDir, iter);
          if (valResult === "rate-limited") {
            if (await handleRateLimit()) continue;
            return;
          }
          softLimitRetries = 0;

          const fixResult = await runFixStep(engine, fixPrompt, logDir, iter);
          if (fixResult === "rate-limited") {
            if (await handleRateLimit()) continue;
            return;
          }
          softLimitRetries = 0;
          continue;
        }
        case "fix": {
          const fixResult = await runFixStep(engine, fixPrompt, logDir, iter);
          if (fixResult === "rate-limited") {
            if (await handleRateLimit()) continue;
            return;
          }
          softLimitRetries = 0;
          continue;
        }
      }

      // If audit step returned "stop" (clean), we break above
      if (options.startStep === "audit") break;
    } else {
      const auditResult = await runAuditStep(engine, auditPrompt, logDir, iter);
      if (auditResult === "rate-limited") {
        if (await handleRateLimit()) continue;
        return;
      }
      if (auditResult === "stop") {
        notify(
          `Willie: codebase clean after ${iter} iteration(s) on ${projectName}. No findings.`,
        );
        break;
      }
      softLimitRetries = 0;

      const valResult = await runValidateStep(engine, logDir, iter);
      if (valResult === "rate-limited") {
        if (await handleRateLimit()) continue;
        return;
      }
      softLimitRetries = 0;

      const fixResult = await runFixStep(engine, fixPrompt, logDir, iter);
      if (fixResult === "rate-limited") {
        if (await handleRateLimit()) continue;
        return;
      }
      softLimitRetries = 0;
    }
  }

  console.log("");
  console.log(pc.cyan("=== Willie Complete ==="));
  console.log(`  Total iterations: ${iter}`);
  console.log(`  Logs: ${logDir}/`);
}
