import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const MAX_TEST_OUTPUT_LINES = 50;

export interface IterationResult {
  iteration: number;
  taskName: string;
  success: boolean;
  message: string;
  testFile?: string;
  filesChanged?: string[];
}

/**
 * Get the progress file path for a project
 */
export function getProgressFile(
  projectName: string,
  progressDir: string,
): string {
  const sanitized = projectName.replace(/[^a-zA-Z0-9]/g, "_");
  const hash = createHash("md5").update(projectName).digest("hex").slice(0, 6);
  return join(progressDir, `progress-${sanitized}-${hash}.log`);
}

/**
 * Read the progress file content
 */
export function readProgress(progressFile: string): string {
  if (!existsSync(progressFile)) {
    return "";
  }
  return readFileSync(progressFile, "utf-8");
}

/**
 * Append an iteration result to the progress file
 */
export function appendProgress(
  progressFile: string,
  result: IterationResult,
): void {
  const entry = formatProgressEntry(result);
  try {
    appendFileSync(progressFile, entry);
  } catch (err) {
    console.error(
      `[PROGRESS ERROR] Failed to append to ${progressFile}: ${err}`,
    );
  }
}

/**
 * Append a failure message to the progress file
 */
export function appendFailure(
  progressFile: string,
  iteration: number,
  reason: string,
  details?: string,
  testOutput?: string,
): void {
  const lines = [
    "",
    `## FAILED - Iteration ${iteration}`,
    `- Reason: ${reason}`,
  ];

  if (details) {
    lines.push(`- Details: ${details}`);
  }

  if (testOutput) {
    const outputLines = testOutput.split("\n");
    const truncated = outputLines.slice(-MAX_TEST_OUTPUT_LINES).join("\n");
    lines.push("");
    lines.push(`### Test Output (last ${MAX_TEST_OUTPUT_LINES} lines):`);
    lines.push("```");
    lines.push(truncated);
    lines.push("```");
  }

  lines.push("---");
  lines.push("");

  try {
    appendFileSync(progressFile, lines.join("\n"));
  } catch (err) {
    console.error(
      `[PROGRESS ERROR] Failed to append failure to ${progressFile}: ${err}`,
    );
  }
}

/**
 * Format a progress entry
 */
function formatProgressEntry(result: IterationResult): string {
  const lines = [
    "",
    `## Iteration ${result.iteration} - ${result.taskName}`,
    `- Status: ${result.success ? "SUCCESS" : "FAILED"}`,
    `- ${result.message}`,
  ];

  if (result.testFile) {
    lines.push(`- Test file: ${result.testFile}`);
  }

  if (result.filesChanged && result.filesChanged.length > 0) {
    lines.push(`- Files changed: ${result.filesChanged.join(", ")}`);
  }

  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

/**
 * Initialize progress directory and file if they don't exist
 */
export function initProgress(progressDir: string, progressFile: string): void {
  if (!progressDir || !progressFile) {
    console.error(
      "[PROGRESS ERROR] progressDir and progressFile must be provided",
    );
    return;
  }

  try {
    if (!existsSync(progressDir)) {
      mkdirSync(progressDir, { recursive: true });
    }

    if (!existsSync(progressFile)) {
      writeFileSync(progressFile, "# Progress Log\n\n");
    }
  } catch (err) {
    console.error(`[PROGRESS ERROR] Failed to initialize progress: ${err}`);
  }
}
