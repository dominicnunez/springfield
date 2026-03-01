import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { logError, logInfo, logSuccess } from "../../ui/logger.js";

const AUDIT_DIR = "audit";
const OLD_EXCEPTIONS_FILE = join(AUDIT_DIR, "exceptions.md");
const EXCEPTIONS_DIR = join(AUDIT_DIR, "exceptions");

// ─────────────────────────────────────────────────────────────
// Section → target file mapping
// ─────────────────────────────────────────────────────────────

type TargetFile = "misreads.md" | "risks.md" | "design.md";

const SECTION_MAP: Record<string, TargetFile> = {
  "false positives": "misreads.md",
  "audit false positives (invalidated findings)": "misreads.md",
  "won't fix": "risks.md",
  "accepted / won't fix": "risks.md",
  "audit won't-fix (accepted)": "risks.md",
  "deferred (tracked in backlog)": "risks.md",
  "accepted dependencies": "risks.md",
  "intentional design decisions": "design.md",
};

function mapSection(heading: string): TargetFile | undefined {
  return SECTION_MAP[heading.toLowerCase()];
}

// ─────────────────────────────────────────────────────────────
// Entry parsing
// ─────────────────────────────────────────────────────────────

interface ParsedEntry {
  raw: string;
  formatted: string;
}

/**
 * Convert a bullet entry to structured format.
 *
 * Input:  `- **Title** — Reason. (`file:line`) *(YYYY-MM-DD)*`
 * Output:
 * ```
 * ### Title
 *
 * **Location:** `file:line`
 * **Date:** YYYY-MM-DD
 *
 * **Reason:** Reason.
 * ```
 */
function reformatBulletEntry(line: string): string | undefined {
  // Extract title: - **Title**
  const titleMatch = line.match(/^-\s+\*\*(.+?)\*\*/);
  if (!titleMatch) return undefined;

  const title = titleMatch[1];

  // Extract location from backtick-wrapped parens: (`path`)
  const locationMatch = line.match(/\(`([^`]+)`\)/);
  const location = locationMatch ? locationMatch[1] : undefined;

  // Extract date from *(YYYY-MM-DD)*
  const dateMatch = line.match(/\*(\d{4}-\d{2}-\d{2})\*/);
  const date = dateMatch ? dateMatch[1] : undefined;

  // Extract reason: everything between title and location/date markers
  let reason = line.slice(titleMatch[0].length);
  // Remove location marker
  if (locationMatch) reason = reason.replace(locationMatch[0], "");
  // Remove date marker
  if (dateMatch) reason = reason.replace(`*${dateMatch[1]}*`, "");
  // Strip leading separators and whitespace
  reason = reason.replace(/^\s*—\s*/, "").trim();
  // Strip trailing whitespace/punctuation leftovers
  reason = reason.replace(/\s+$/, "");

  const parts = [`### ${title}`, ""];
  if (location) parts.push(`**Location:** \`${location}\``);
  if (date) parts.push(`**Date:** ${date}`);
  if (location || date) parts.push("");
  if (reason) parts.push(`**Reason:** ${reason}`);

  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────
// File parsing
// ─────────────────────────────────────────────────────────────

interface SectionEntries {
  target: TargetFile;
  entries: ParsedEntry[];
}

function parseExceptionsFile(content: string): SectionEntries[] {
  const lines = content.split("\n");
  const sections: SectionEntries[] = [];
  let current: SectionEntries | undefined;
  let buffer: string[] = [];

  function flushBuffer(): void {
    if (!current || buffer.length === 0) return;
    const raw = buffer.join("\n").trim();
    if (!raw) return;

    // Check if this is already a structured ### entry
    if (raw.startsWith("### ")) {
      current.entries.push({ raw, formatted: raw });
    } else if (raw.startsWith("- **")) {
      // Bullet entry — reformat each bullet line
      const bulletLines = raw.split("\n").filter((l) => l.startsWith("- **"));
      for (const line of bulletLines) {
        const formatted = reformatBulletEntry(line);
        if (formatted) {
          current.entries.push({ raw: line, formatted });
        }
      }
    }
    buffer = [];
  }

  for (const line of lines) {
    // Match ## section headers (not # top-level or ### entries)
    const sectionMatch = line.match(/^## (.+)/);
    if (sectionMatch) {
      flushBuffer();
      const heading = sectionMatch[1].trim();
      const target = mapSection(heading);
      if (target) {
        current = { target, entries: [] };
        sections.push(current);
      } else {
        current = undefined;
      }
      continue;
    }

    // Match ### structured entries — accumulate until next ### or ## boundary
    if (line.startsWith("### ") && current) {
      flushBuffer();
      buffer.push(line);
      continue;
    }

    // Skip HTML comments and blank-only lines at section start
    if (
      line.match(/^\s*<!--.*-->\s*$/) ||
      (buffer.length === 0 && !line.trim())
    ) {
      continue;
    }

    if (current) {
      buffer.push(line);
    }
  }

  flushBuffer();
  return sections;
}

// ─────────────────────────────────────────────────────────────
// Template content for new files
// ─────────────────────────────────────────────────────────────

const ENTRY_FORMAT = `>
> Entry format:
> ### Plain language description
> **Location:** \`file/path:line\` — optional context
> **Date:** YYYY-MM-DD
> **Reason:** Explanation (can be multiple lines)`;

const TEMPLATES: Record<TargetFile, string> = {
  "misreads.md": `# Misreads

> Findings where the audit misread the code or described behavior that doesn't occur.
> Managed by sfk willie. Follow the entry format below.
${ENTRY_FORMAT}
`,
  "risks.md": `# Risks

> Real findings consciously accepted — architectural cost, external constraints, disproportionate effort.
> Managed by sfk willie. Follow the entry format below.
${ENTRY_FORMAT}
`,
  "design.md": `# Design

> Findings that describe behavior which is correct by design.
> Managed by sfk willie. Follow the entry format below.
${ENTRY_FORMAT}
`,
};

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

export function migrateExceptions(): void {
  if (!existsSync(OLD_EXCEPTIONS_FILE)) {
    logError(`${OLD_EXCEPTIONS_FILE} not found — nothing to migrate.`);
    process.exitCode = 1;
    return;
  }

  if (existsSync(EXCEPTIONS_DIR)) {
    logError(
      `${EXCEPTIONS_DIR}/ already exists — looks like migration already happened.`,
    );
    process.exitCode = 1;
    return;
  }

  const content = readFileSync(OLD_EXCEPTIONS_FILE, "utf-8");
  const sections = parseExceptionsFile(content);

  // Aggregate entries by target file
  const byFile = new Map<TargetFile, ParsedEntry[]>();
  for (const section of sections) {
    const existing = byFile.get(section.target) ?? [];
    existing.push(...section.entries);
    byFile.set(section.target, existing);
  }

  // Create directory and write files
  mkdirSync(EXCEPTIONS_DIR, { recursive: true });

  const targets: TargetFile[] = ["misreads.md", "risks.md", "design.md"];
  const counts: Record<TargetFile, number> = {
    "misreads.md": 0,
    "risks.md": 0,
    "design.md": 0,
  };

  for (const target of targets) {
    const entries = byFile.get(target) ?? [];
    counts[target] = entries.length;

    let fileContent = TEMPLATES[target];
    if (entries.length > 0) {
      fileContent += `\n${entries.map((e) => e.formatted).join("\n\n")}\n`;
    }

    writeFileSync(join(EXCEPTIONS_DIR, target), fileContent);
  }

  unlinkSync(OLD_EXCEPTIONS_FILE);

  const total =
    counts["misreads.md"] + counts["risks.md"] + counts["design.md"];
  logSuccess(`Migrated ${total} entries from ${OLD_EXCEPTIONS_FILE}:`);
  logInfo(`  misreads.md: ${counts["misreads.md"]} entries`);
  logInfo(`  risks.md:    ${counts["risks.md"]} entries`);
  logInfo(`  design.md:   ${counts["design.md"]} entries`);
}
