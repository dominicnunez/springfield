import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pc from "picocolors";

const DEFAULT_MAX_LOG_LINES = 50;

export interface LoggerOptions {
  logFile?: string;
  verbose?: boolean;
}

let logFilePath: string | undefined;
let verboseMode = false;

export function initLogger(options: LoggerOptions = {}): void {
  logFilePath = options.logFile;
  verboseMode = options.verbose ?? false;

  if (logFilePath) {
    const dir = dirname(logFilePath);
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch (err) {
        console.error(
          `[LOG ERROR] Failed to create log directory ${dir}: ${err}`,
        );
        logFilePath = undefined;
      }
    }
  }
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function writeToLogFile(level: string, message: string): void {
  if (!logFilePath) return;
  const line = `[${timestamp()}] [${level}] ${message}\n`;
  try {
    appendFileSync(logFilePath, line);
  } catch (err) {
    console.error(`[LOG ERROR] Failed to write to log file: ${err}`);
  }
}

export function logInfo(message: string): void {
  const formatted = /^Step \d+:/.test(message) ? pc.green(message) : message;
  console.log(formatted);
  writeToLogFile("INFO", message);
}

export function logSuccess(message: string): void {
  console.log(pc.green(message));
  writeToLogFile("INFO", message);
}

export function logWarning(message: string): void {
  console.log(pc.yellow(`[WARN] ${message}`));
  writeToLogFile("WARN", message);
}

export function logError(message: string): void {
  console.error(pc.red(`[ERROR] ${message}`));
  writeToLogFile("ERROR", message);
}

export function logDebug(message: string): void {
  if (verboseMode) {
    console.log(pc.dim(`[DEBUG] ${message}`));
  }
  writeToLogFile("DEBUG", message);
}

export function logIteration(
  iteration: number,
  maxIterations: number,
  task: string,
  model: string,
): void {
  const iterStr =
    maxIterations === -1
      ? `${iteration} (infinite mode)`
      : `${iteration} of ${maxIterations}`;

  console.log("");
  console.log(pc.cyan("==========================================="));
  console.log(pc.cyan(`  Iteration ${iterStr} - ${model}`));
  console.log(pc.cyan(`  Task: ${task}`));
  console.log(pc.cyan("==========================================="));

  writeToLogFile("INFO", `--- Iteration ${iteration} ---`);
  writeToLogFile("INFO", `Task: ${task}`);
}

export function logSessionStart(
  projectName: string,
  engine: string,
  model: string,
): void {
  if (!logFilePath) return;

  const header = [
    "",
    "═══════════════════════════════════════════════════════════════",
    `  Ralph Session Started: ${timestamp()}`,
    `  Project: ${projectName}`,
    `  Engine: ${engine}`,
    `  Model: ${model}`,
    "═══════════════════════════════════════════════════════════════",
    "",
  ].join("\n");

  try {
    appendFileSync(logFilePath, header);
  } catch (err) {
    console.error(
      `[LOG ERROR] Failed to write session start to log file: ${err}`,
    );
  }
}

export function logAiOutput(
  output: string,
  truncateLines = DEFAULT_MAX_LOG_LINES,
): void {
  if (!logFilePath) return;

  const lines = output.split("\n");
  const truncated = lines.slice(0, truncateLines).join("\n");
  try {
    appendFileSync(logFilePath, `${truncated}\n`);

    if (lines.length > truncateLines) {
      appendFileSync(logFilePath, "[... truncated ...]\n");
    }
  } catch (err) {
    console.error(`[LOG ERROR] Failed to write AI output to log file: ${err}`);
  }
}

export function formatDivider(text: string, width = 40): string {
  const padding = Math.max(0, width - text.length - 2);
  const left = Math.floor(padding / 2);
  const right = Math.ceil(padding / 2);
  return `${"=".repeat(left)} ${text} ${"=".repeat(right)}`;
}

// Formatted output helpers
export function printHeader(text: string): void {
  console.log(pc.bold(pc.cyan(text)));
}

export function printStep(text: string): void {
  console.log(pc.dim(`  ${text}`));
}

export function printDivider(): void {
  console.log(pc.dim("-------------------------------------------"));
}
