import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
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
  FIX_PROMPT,
  VALIDATE_PROMPT,
} from "../../engines/base.js";
import { ClaudeEngine } from "../../engines/claude.js";
import { OpenCodeEngine } from "../../engines/opencode.js";
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
  verbose?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const AUDIT_DIR = "audit";
const REPORT_FILE = join(AUDIT_DIR, "report.md");
const EXCEPTIONS_FILE = join(AUDIT_DIR, "exceptions.md");

const EXCEPTIONS_TEMPLATE = `# Audit Exceptions

> Items validated as false positives or accepted as won't-fix.
> Managed by willie audit loop. Do not edit format manually.
>
> Entry format:
> ### Plain language description
> **Location:** \`file/path:line\` — optional context
> **Date:** YYYY-MM-DD
> **Reason:** Explanation (can be multiple lines)

## False Positives

<!-- Findings where the audit misread the code or described behavior that doesn't occur -->

## Won't Fix

<!-- Real findings not worth fixing — architectural cost, external constraints, etc. -->

## Intentional Design Decisions

<!-- Findings that describe behavior which is correct by design -->
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
  if (!existsSync(EXCEPTIONS_FILE)) {
    writeFileSync(EXCEPTIONS_FILE, EXCEPTIONS_TEMPLATE);
    logInfo("Created audit/exceptions.md template");
  }
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

async function runAuditStep(
  engine: Engine,
  auditPrompt: string,
  logDir: string,
  iter: number,
): Promise<boolean> {
  logInfo("STEP 1: Running audit...");
  console.log(pc.cyan("  Step 1: Audit"));

  const result = await engine.run(auditPrompt);
  logToFile(logDir, iter, "audit", result.output);

  if (!result.success) {
    logWarning(`Claude exited with code ${result.exitCode} for audit step`);
  }

  if (!existsSync(REPORT_FILE)) {
    logSuccess("No audit/report.md generated — codebase is clean!");
    console.log(pc.green("  No findings — codebase is clean!"));
    return false; // signal to stop
  }

  const findingCount = countFindings(REPORT_FILE);
  if (findingCount === 0) {
    logSuccess("Audit report has no findings. Cleaning up.");
    console.log(pc.green("  Audit report empty. Cleaning up."));
    unlinkSync(REPORT_FILE);
    return false; // signal to stop
  }

  logInfo(`Audit found ${findingCount} issue(s).`);
  console.log(`  Found ${findingCount} issue(s)`);
  return true; // continue
}

async function runValidateStep(
  engine: Engine,
  logDir: string,
  iter: number,
): Promise<void> {
  logInfo("STEP 2: Validating findings...");
  console.log(pc.cyan("  Step 2: Validate"));

  const result = await engine.run(VALIDATE_PROMPT);
  logToFile(logDir, iter, "validate", result.output);

  if (!result.success) {
    logWarning(`Claude exited with code ${result.exitCode} for validate step`);
  }

  if (!existsSync(REPORT_FILE)) {
    logInfo("All findings were false positives.");
    console.log("  All findings were false positives");
    return;
  }

  const remaining = countFindings(REPORT_FILE);
  logInfo(`${remaining} validated finding(s) remain.`);
  console.log(`  ${remaining} validated finding(s) remain`);

  if (remaining === 0) {
    unlinkSync(REPORT_FILE);
    logInfo("Report empty after validation.");
  }
}

async function runFixStep(
  engine: Engine,
  logDir: string,
  iter: number,
): Promise<void> {
  if (!existsSync(REPORT_FILE)) {
    logInfo("No audit report to fix. Skipping step 3.");
    console.log("  No report to fix, skipping");
    return;
  }

  logInfo("STEP 3: Fixing issues...");
  console.log(pc.cyan("  Step 3: Fix"));

  const result = await engine.run(FIX_PROMPT);
  logToFile(logDir, iter, "fix", result.output);

  if (!result.success) {
    logWarning(`Claude exited with code ${result.exitCode} for fix step`);
  }

  if (!existsSync(REPORT_FILE)) {
    logInfo("All issues resolved.");
    console.log("  All issues resolved");
  } else {
    const remaining = countFindings(REPORT_FILE);
    if (remaining > 0) {
      logWarning(`${remaining} finding(s) remain after fix step.`);
      console.log(pc.yellow(`  ${remaining} finding(s) remain after fix`));
    }
  }
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
  console.log("");

  let iter = 0;
  let firstIter = true;

  while (true) {
    iter++;

    if (options.maxIterations > 0 && iter > options.maxIterations) {
      logInfo(`Reached max iterations (${options.maxIterations}). Stopping.`);
      console.log(
        pc.yellow(
          `  Reached max iterations (${options.maxIterations}). Stopping.`,
        ),
      );
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
          const shouldContinue = await runAuditStep(
            engine,
            auditPrompt,
            logDir,
            iter,
          );
          if (!shouldContinue) {
            notify(
              `Willie: codebase clean after ${iter} iteration(s) on ${projectName}. No findings.`,
            );
            break;
          }
          await runValidateStep(engine, logDir, iter);
          await runFixStep(engine, logDir, iter);
          continue;
        }
        case "validate":
          await runValidateStep(engine, logDir, iter);
          await runFixStep(engine, logDir, iter);
          continue;
        case "fix":
          await runFixStep(engine, logDir, iter);
          continue;
      }

      // If audit step returned false (clean), we break above
      if (options.startStep === "audit") break;
    } else {
      const shouldContinue = await runAuditStep(
        engine,
        auditPrompt,
        logDir,
        iter,
      );
      if (!shouldContinue) {
        notify(
          `Willie: codebase clean after ${iter} iteration(s) on ${projectName}. No findings.`,
        );
        break;
      }
      await runValidateStep(engine, logDir, iter);
      await runFixStep(engine, logDir, iter);
    }
  }

  console.log("");
  console.log(pc.cyan("=== Willie Complete ==="));
  console.log(`  Total iterations: ${iter}`);
  console.log(`  Logs: ${logDir}/`);
}
