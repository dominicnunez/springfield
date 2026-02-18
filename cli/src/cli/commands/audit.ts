import { join, basename } from "node:path";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import type { Config } from "../../config/loader.js";
import { getWillieModel, getWillieEffort } from "../../config/loader.js";
import { ClaudeEngine } from "../../engines/claude.js";
import { VALIDATE_PROMPT, FIX_PROMPT, type Engine } from "../../engines/base.js";
import {
  initLogger,
  logInfo,
  logSuccess,
  logWarning,
  logError,
} from "../../ui/logger.js";
import pc from "picocolors";
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type AuditStep = "audit" | "validate" | "fix";

export interface AuditOptions {
  startStep: AuditStep;
  maxIterations: number; // 0 = unlimited
  auditPromptPath: string;
  verbose?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const REPORT_FILE = "audit-report.md";
const EXCEPTIONS_FILE = "known-exceptions.md";

const KNOWN_EXCEPTIONS_TEMPLATE = `# Known Exceptions

> Items validated as false positives or accepted as won't-fix.
> Managed by willie audit loop. Do not edit format manually.

## False Positives

<!-- Items the auditor flagged but are not actual issues -->

## Won't Fix

<!-- Items that are real but intentionally left as-is -->
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
  } catch {
    // openclaw not available
  }
}

function countFindings(reportPath: string): number {
  if (!existsSync(reportPath)) return 0;
  const content = readFileSync(reportPath, "utf-8");
  const matches = content.match(/### \[/g);
  return matches ? matches.length : 0;
}

function ensureKnownExceptions(): void {
  if (!existsSync(EXCEPTIONS_FILE)) {
    writeFileSync(EXCEPTIONS_FILE, KNOWN_EXCEPTIONS_TEMPLATE);
    logInfo("Created known-exceptions.md template");
  }
}

function logToFile(logDir: string, iter: number, step: string, output: string): void {
  const logFile = join(logDir, `iter${iter}-${step}.log`);
  appendFileSync(logFile, output);
}

// ─────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────

async function runAuditStep(
  engine: Engine,
  auditPromptPath: string,
  logDir: string,
  iter: number
): Promise<boolean> {
  logInfo("STEP 1: Running audit...");
  console.log(pc.cyan("  Step 1: Audit"));

  const auditPrompt = readFileSync(auditPromptPath, "utf-8");
  const result = await engine.run(auditPrompt);
  logToFile(logDir, iter, "audit", result.output);

  if (!result.success) {
    logWarning(`Claude exited with code ${result.exitCode} for audit step`);
  }

  if (!existsSync(REPORT_FILE)) {
    logSuccess("No audit-report.md generated — codebase is clean!");
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
  iter: number
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
  iter: number
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
  options: AuditOptions
): Promise<void> {
  const projectName = basename(process.cwd());
  const logDir = ".audit-logs";

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // Willie always uses Claude opus (or per-agent override)
  const model = getWillieModel(config);
  const effort = getWillieEffort(config);
  const engine: Engine = new ClaudeEngine(model, effort);

  if (!engine.isAvailable()) {
    logError("'claude' command not found. Willie requires Claude CLI.");
    process.exitCode = 1;
    return;
  }

  // Verify audit prompt exists
  if (!existsSync(options.auditPromptPath)) {
    logError(`${options.auditPromptPath} not found. Create it first.`);
    process.exitCode = 1;
    return;
  }

  // Ensure known-exceptions.md template exists
  ensureKnownExceptions();

  const maxStr =
    options.maxIterations > 0
      ? String(options.maxIterations)
      : "unlimited";

  console.log("");
  console.log(pc.cyan("=== Willie Starting ==="));
  console.log(`  Project: ${projectName}`);
  console.log(`  Start step: ${options.startStep}`);
  console.log(`  Max iterations: ${maxStr}`);
  console.log(`  Model: ${model} (effort: ${effort})`);
  console.log("");

  let iter = 0;
  let firstIter = true;

  while (true) {
    iter++;

    if (options.maxIterations > 0 && iter > options.maxIterations) {
      logInfo(`Reached max iterations (${options.maxIterations}). Stopping.`);
      console.log(
        pc.yellow(
          `  Reached max iterations (${options.maxIterations}). Stopping.`
        )
      );
      notify(
        `Willie completed ${options.maxIterations} iteration(s) on ${projectName}.`
      );
      break;
    }

    console.log("");
    console.log(
      pc.cyan(`========== ITERATION ${iter} ==========`)
    );

    if (firstIter) {
      firstIter = false;

      switch (options.startStep) {
        case "audit": {
          const shouldContinue = await runAuditStep(
            engine,
            options.auditPromptPath,
            logDir,
            iter
          );
          if (!shouldContinue) {
            notify(
              `Willie: codebase clean after ${iter} iteration(s) on ${projectName}. No findings.`
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
        options.auditPromptPath,
        logDir,
        iter
      );
      if (!shouldContinue) {
        notify(
          `Willie: codebase clean after ${iter} iteration(s) on ${projectName}. No findings.`
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
