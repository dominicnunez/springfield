import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import type { Config } from "../../config/loader.js";
import type { Engine } from "../../engines/base.js";
import { logDebug, logError, logInfo, logSuccess } from "../../ui/logger.js";
import { AUDIT_EXCEPTIONS_DIR } from "../audit-paths.js";
import { initializeWillieEngine } from "../engine-factory.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ExceptionEntry {
  heading: string;
  location?: string;
  rawText: string;
}

export interface ExceptionFile {
  path: string;
  header: string;
  entries: ExceptionEntry[];
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const CONTEXT_LINES = 20;

// ─────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────

export function parseExceptionFile(
  filePath: string,
  content: string,
): ExceptionFile {
  const lines = content.split("\n");
  const entries: ExceptionEntry[] = [];
  let headerEnd = -1;
  let currentStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("### ")) {
      if (currentStart === -1) {
        // First entry — everything before is the header
        headerEnd = i;
      } else {
        // Flush previous entry
        entries.push(buildEntry(lines, currentStart, i));
      }
      currentStart = i;
    }
  }

  // Flush last entry
  if (currentStart !== -1) {
    entries.push(buildEntry(lines, currentStart, lines.length));
  }

  const header =
    headerEnd === -1
      ? content // No entries — entire content is header
      : lines.slice(0, headerEnd).join("\n");

  return { path: filePath, header, entries };
}

function buildEntry(
  lines: string[],
  start: number,
  end: number,
): ExceptionEntry {
  const rawText = lines.slice(start, end).join("\n").replace(/\n+$/, "");
  const heading = lines[start].slice(4); // strip "### "

  // Extract location from **Location:** `path` pattern
  let location: string | undefined;
  for (let i = start + 1; i < end; i++) {
    const match = lines[i].match(/^\*\*Location:\*\*\s*`([^`]+)`/);
    if (match) {
      // Take just the file path, strip line number and trailing context
      location = match[1].split(":")[0];
      break;
    }
  }

  return { heading, location, rawText };
}

// ─────────────────────────────────────────────────────────────
// Phase 1 — deterministic file-existence check
// ─────────────────────────────────────────────────────────────

interface PruneResult {
  entry: ExceptionEntry;
  reason: string;
}

function checkFileExistence(entries: ExceptionEntry[]): {
  stale: PruneResult[];
  surviving: ExceptionEntry[];
} {
  const stale: PruneResult[] = [];
  const surviving: ExceptionEntry[] = [];

  for (const entry of entries) {
    if (entry.location && !existsSync(entry.location)) {
      stale.push({
        entry,
        reason: `referenced file '${entry.location}' no longer exists`,
      });
    } else {
      surviving.push(entry);
    }
  }

  return { stale, surviving };
}

// ─────────────────────────────────────────────────────────────
// Phase 2 — AI review
// ─────────────────────────────────────────────────────────────

function buildCodeContext(entries: ExceptionEntry[]): string {
  const parts: string[] = [];

  for (const entry of entries) {
    if (!entry.location || !existsSync(entry.location)) continue;

    try {
      const content = readFileSync(entry.location, "utf-8");
      const lines = content.split("\n");

      // Try to extract line number from the raw entry
      const lineMatch = entry.rawText.match(
        /\*\*Location:\*\*\s*`[^`]+:(\d+)`/,
      );
      const targetLine = lineMatch ? parseInt(lineMatch[1], 10) - 1 : 0;

      const start = Math.max(0, targetLine - CONTEXT_LINES);
      const end = Math.min(lines.length, targetLine + CONTEXT_LINES);
      const snippet = lines.slice(start, end).join("\n");

      parts.push(`--- ${entry.location}:${start + 1}-${end} ---\n${snippet}\n`);
    } catch {
      // File unreadable, skip context
    }
  }

  return parts.join("\n");
}

function buildAiPrompt(
  file: ExceptionFile,
  entries: ExceptionEntry[],
  codeContext: string,
): string {
  const entryList = entries.map((e, i) => `[${i}] ${e.rawText}`).join("\n\n");

  return `You are reviewing audit exception entries for staleness. An entry is stale if:
- The code it references has been refactored so the concern no longer applies
- The vulnerability or issue described has been fixed
- The rationale is outdated (e.g., references removed dependencies or APIs)

File: ${file.path}

Exception entries:
${entryList}

Code context around referenced locations:
${codeContext || "(no code context available)"}

Respond with ONLY a JSON array of indices (0-based) of entries that are stale. If none are stale, respond with [].
Example: [0, 2]

Do not include any other text.`;
}

async function aiReview(
  engine: Engine,
  file: ExceptionFile,
  entries: ExceptionEntry[],
  _verbose?: boolean,
): Promise<PruneResult[]> {
  if (entries.length === 0) return [];

  const codeContext = buildCodeContext(entries);
  const prompt = buildAiPrompt(file, entries, codeContext);

  logDebug(`AI reviewing ${entries.length} entries in ${file.path}`);

  const result = await engine.run(prompt);

  if (!result.success) {
    logDebug(
      `AI review returned exit code ${result.exitCode} for ${file.path}`,
    );
    return [];
  }

  // Parse JSON array from output
  const jsonMatch = result.output.match(/\[[\d\s,]*\]/);
  if (!jsonMatch) {
    logDebug(`No valid JSON array in AI response for ${file.path}`);
    return [];
  }

  try {
    const indices: number[] = JSON.parse(jsonMatch[0]);
    const stale: PruneResult[] = [];

    for (const idx of indices) {
      if (idx >= 0 && idx < entries.length) {
        stale.push({
          entry: entries[idx],
          reason: "AI determined entry is stale",
        });
      }
    }

    return stale;
  } catch {
    logDebug(`Failed to parse AI response for ${file.path}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// File rewriting
// ─────────────────────────────────────────────────────────────

export function rebuildFile(
  file: ExceptionFile,
  entriesToRemove: Set<string>,
): string {
  const surviving = file.entries.filter((e) => !entriesToRemove.has(e.rawText));

  if (surviving.length === 0) {
    return `${file.header}\n`;
  }

  return `${file.header}\n${surviving.map((e) => e.rawText).join("\n\n")}\n`;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

export async function pruneExceptions(
  config: Config,
  options: { verbose?: boolean },
): Promise<void> {
  if (!existsSync(AUDIT_EXCEPTIONS_DIR)) {
    logError(
      `${AUDIT_EXCEPTIONS_DIR}/ not found. Run 'sfk audit' first to generate exception files.`,
    );
    process.exitCode = 1;
    return;
  }

  const mdFiles = readdirSync(AUDIT_EXCEPTIONS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (mdFiles.length === 0) {
    logInfo("No exception files found.");
    return;
  }

  // Parse all files
  const files: ExceptionFile[] = mdFiles.map((f) => {
    const filePath = join(AUDIT_EXCEPTIONS_DIR, f);
    const content = readFileSync(filePath, "utf-8");
    return parseExceptionFile(filePath, content);
  });

  const totalEntries = files.reduce((sum, f) => sum + f.entries.length, 0);
  if (totalEntries === 0) {
    logInfo("No exception entries to prune.");
    return;
  }

  console.log("");
  console.log(pc.cyan("=== Prune Starting ==="));
  console.log(`  Files: ${mdFiles.length}`);
  console.log(`  Entries: ${totalEntries}`);
  console.log("");

  // Phase 1: deterministic check
  logInfo("Phase 1: checking for deleted files...");
  const allStale: PruneResult[] = [];

  const phase1Survivors = new Map<string, ExceptionEntry[]>();

  for (const file of files) {
    const { stale, surviving } = checkFileExistence(file.entries);
    allStale.push(...stale);
    phase1Survivors.set(file.path, surviving);
  }

  if (allStale.length > 0) {
    logInfo(`  Found ${allStale.length} entries referencing deleted files.`);
  } else {
    logInfo("  No entries reference deleted files.");
  }

  // Phase 2: AI review
  const engine = initializeWillieEngine(
    config,
    (engineName, cliName) =>
      `'${engineName}' command not found. Prune requires ${cliName} for AI review.`,
  );
  if (!engine) {
    process.exitCode = 1;
    return;
  }

  logInfo("Phase 2: AI review for semantic staleness...");

  for (const file of files) {
    const surviving = phase1Survivors.get(file.path) ?? [];
    if (surviving.length === 0) continue;

    const aiStale = await aiReview(engine, file, surviving, options.verbose);
    allStale.push(...aiStale);
  }

  // Apply removals
  if (allStale.length === 0) {
    logSuccess("No stale entries found.");
    return;
  }

  const removeSet = new Set(allStale.map((r) => r.entry.rawText));

  for (const file of files) {
    const fileRemovals = file.entries.filter((e) => removeSet.has(e.rawText));
    if (fileRemovals.length === 0) continue;

    const updated = rebuildFile(file, removeSet);
    writeFileSync(file.path, updated);
    logInfo(`  ${file.path}: removed ${fileRemovals.length} entries`);
  }

  console.log("");
  logSuccess(`Pruned ${allStale.length} stale entries:`);
  for (const result of allStale) {
    logInfo(`  - ${result.entry.heading}: ${result.reason}`);
  }

  console.log("");
  console.log(pc.cyan("=== Prune Complete ==="));
}
