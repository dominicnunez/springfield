import { existsSync, readFileSync, writeFileSync } from "node:fs";
import pc from "picocolors";
import type { Config } from "../../config/loader.js";
import type { Engine } from "../../engines/base.js";
import { logDebug, logError, logInfo, logSuccess } from "../../ui/logger.js";
import {
  AUDIT_EXCEPTIONS_DIR,
  listExceptionMarkdownFiles,
  sourceCandidatesForExceptionFile,
} from "../audit-paths.js";
import { initializeWillieEngine } from "../engine-factory.js";

export interface ExceptionEntry {
  heading: string;
  line?: number;
  rawText: string;
}

export interface ExceptionFile {
  path: string;
  header: string;
  entries: ExceptionEntry[];
}

const CONTEXT_LINES = 20;

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
        headerEnd = i;
      } else {
        entries.push(buildEntry(lines, currentStart, i));
      }
      currentStart = i;
    }
  }

  if (currentStart !== -1) {
    entries.push(buildEntry(lines, currentStart, lines.length));
  }

  const header =
    headerEnd === -1 ? content : lines.slice(0, headerEnd).join("\n");

  return { path: filePath, header, entries };
}

function buildEntry(
  lines: string[],
  start: number,
  end: number,
): ExceptionEntry {
  const rawText = lines.slice(start, end).join("\n").replace(/\n+$/, "");
  const heading = lines[start].slice(4);

  let line: number | undefined;
  for (let i = start + 1; i < end; i++) {
    const match = lines[i].match(/^\*\*Line:\*\*\s*`?(\d+)`?/);
    if (match) {
      line = Number.parseInt(match[1], 10);
      break;
    }
  }

  return { heading, line, rawText };
}

interface PruneResult {
  entry: ExceptionEntry;
  reason: string;
}

function checkFileExistence(file: ExceptionFile): {
  stale: PruneResult[];
  surviving: ExceptionEntry[];
} {
  const sourceCandidates = sourceCandidatesForExceptionFile(file.path);
  if (sourceCandidates.length > 0) {
    return { stale: [], surviving: file.entries };
  }

  return {
    stale: file.entries.map((entry) => ({
      entry,
      reason: `mirrored source file for '${file.path}' no longer exists`,
    })),
    surviving: [],
  };
}

function buildCodeContext(
  file: ExceptionFile,
  entries: ExceptionEntry[],
): string {
  const sourceCandidates = sourceCandidatesForExceptionFile(file.path);
  if (sourceCandidates.length !== 1) return "";

  const sourceFile = sourceCandidates[0];
  const parts: string[] = [];

  for (const entry of entries) {
    if (!entry.line || !existsSync(sourceFile)) continue;

    try {
      const content = readFileSync(sourceFile, "utf-8");
      const lines = content.split("\n");
      const targetLine = entry.line - 1;

      const start = Math.max(0, targetLine - CONTEXT_LINES);
      const end = Math.min(lines.length, targetLine + CONTEXT_LINES);
      const snippet = lines.slice(start, end).join("\n");

      parts.push(`--- ${sourceFile}:${start + 1}-${end} ---\n${snippet}\n`);
    } catch {}
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

Code context around referenced lines:
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

  const codeContext = buildCodeContext(file, entries);
  const prompt = buildAiPrompt(file, entries, codeContext);

  logDebug(`AI reviewing ${entries.length} entries in ${file.path}`);

  const result = await engine.run(prompt);

  if (!result.success) {
    logDebug(
      `AI review returned exit code ${result.exitCode} for ${file.path}`,
    );
    return [];
  }

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

  const mdFiles = listExceptionMarkdownFiles();

  if (mdFiles.length === 0) {
    logInfo("No exception files found.");
    return;
  }

  const files: ExceptionFile[] = mdFiles.map((f) => {
    const content = readFileSync(f, "utf-8");
    return parseExceptionFile(f, content);
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

  logInfo("Phase 1: checking for deleted files...");
  const allStale: PruneResult[] = [];
  const phase1Survivors = new Map<string, ExceptionEntry[]>();

  for (const file of files) {
    const { stale, surviving } = checkFileExistence(file);
    allStale.push(...stale);
    phase1Survivors.set(file.path, surviving);
  }

  if (allStale.length > 0) {
    logInfo(`  Found ${allStale.length} entries referencing deleted files.`);
  } else {
    logInfo("  No entries reference deleted files.");
  }

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
