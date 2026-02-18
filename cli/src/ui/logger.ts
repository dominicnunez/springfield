import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pc from "picocolors";

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
      mkdirSync(dir, { recursive: true });
    }
  }
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function writeToLogFile(level: string, message: string): void {
  if (!logFilePath) return;
  const line = `[${timestamp()}] [${level}] ${message}\n`;
  appendFileSync(logFilePath, line);
}

export function logInfo(message: string): void {
  console.log(message);
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

  appendFileSync(logFilePath, header);
}

export function logAiOutput(output: string, truncateLines = 50): void {
  if (!logFilePath) return;

  const lines = output.split("\n");
  const truncated = lines.slice(0, truncateLines).join("\n");
  appendFileSync(logFilePath, `${truncated}\n`);

  if (lines.length > truncateLines) {
    appendFileSync(logFilePath, "[... truncated ...]\n");
  }
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
