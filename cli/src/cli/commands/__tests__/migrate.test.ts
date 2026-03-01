import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initLogger } from "../../../ui/logger.js";
import { migrateExceptions } from "../migrate.js";

describe("migrateExceptions", () => {
  let originalCwd: string;
  let tempRoot: string;
  let auditDir: string;
  let oldFile: string;
  let exceptionsDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempRoot = mkdtempSync(join(tmpdir(), "migrate-test-"));
    auditDir = join(tempRoot, "audit");
    oldFile = join(auditDir, "exceptions.md");
    exceptionsDir = join(auditDir, "exceptions");
    mkdirSync(auditDir, { recursive: true });
    process.chdir(tempRoot);
    process.exitCode = 0;
    initLogger({});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exitCode = 0;
    initLogger({});
    rmSync(tempRoot, { recursive: true, force: true });
  });

  // ── Error paths ──────────────────────────────────────────────

  test("sets exit code 1 when exceptions.md does not exist", () => {
    // No file created — auditDir exists but exceptions.md doesn't
    rmSync(oldFile, { force: true });

    migrateExceptions();

    expect(process.exitCode).toBe(1);
    expect(existsSync(exceptionsDir)).toBe(false);
  });

  test("sets exit code 1 when exceptions/ directory already exists", () => {
    writeFileSync(oldFile, "# Exceptions\n");
    mkdirSync(exceptionsDir, { recursive: true });

    migrateExceptions();

    expect(process.exitCode).toBe(1);
    // Old file should NOT be deleted
    expect(existsSync(oldFile)).toBe(true);
  });

  // ── Empty file ───────────────────────────────────────────────

  test("creates all three files with template headers for empty input", () => {
    writeFileSync(oldFile, "# Audit Exceptions\n\nNothing here.\n");

    migrateExceptions();

    expect(process.exitCode).toBe(0);
    expect(existsSync(join(exceptionsDir, "misreads.md"))).toBe(true);
    expect(existsSync(join(exceptionsDir, "risks.md"))).toBe(true);
    expect(existsSync(join(exceptionsDir, "design.md"))).toBe(true);

    const misreads = readFileSync(join(exceptionsDir, "misreads.md"), "utf-8");
    expect(misreads).toContain("# Misreads");

    const risks = readFileSync(join(exceptionsDir, "risks.md"), "utf-8");
    expect(risks).toContain("# Risks");

    const design = readFileSync(join(exceptionsDir, "design.md"), "utf-8");
    expect(design).toContain("# Design");
  });

  test("deletes the old exceptions.md after migration", () => {
    writeFileSync(oldFile, "# Exceptions\n");

    migrateExceptions();

    expect(existsSync(oldFile)).toBe(false);
  });

  // ── Section header mapping ───────────────────────────────────

  const sectionMappingCases = [
    { header: "False Positives", target: "misreads.md" },
    { header: "Audit False Positives (Invalidated Findings)", target: "misreads.md" },
    { header: "Won't Fix", target: "risks.md" },
    { header: "Accepted / Won't Fix", target: "risks.md" },
    { header: "Audit Won't-Fix (Accepted)", target: "risks.md" },
    { header: "Deferred (Tracked in Backlog)", target: "risks.md" },
    { header: "Accepted Dependencies", target: "risks.md" },
    { header: "Intentional Design Decisions", target: "design.md" },
  ];

  for (const { header, target } of sectionMappingCases) {
    test(`maps section "${header}" to ${target}`, () => {
      const content = [
        "# Exceptions",
        "",
        `## ${header}`,
        "",
        `- **Test Entry** — Some reason. (\`src/foo.ts:10\`) *2024-06-15*`,
        "",
      ].join("\n");

      writeFileSync(oldFile, content);
      migrateExceptions();

      const result = readFileSync(join(exceptionsDir, target), "utf-8");
      expect(result).toContain("### Test Entry");
    });
  }

  // ── Bullet entry reformatting ────────────────────────────────

  test("reformats bullet entry into structured ### format", () => {
    const content = [
      "# Exceptions",
      "",
      "## False Positives",
      "",
      "- **Hardcoded secret** — Not a real secret, test fixture. (`src/test/fixtures.ts:42`) *2024-03-10*",
      "",
    ].join("\n");

    writeFileSync(oldFile, content);
    migrateExceptions();

    const result = readFileSync(join(exceptionsDir, "misreads.md"), "utf-8");
    expect(result).toContain("### Hardcoded secret");
    expect(result).toContain("**Location:** `src/test/fixtures.ts:42`");
    expect(result).toContain("**Date:** 2024-03-10");
    expect(result).toContain("**Reason:** Not a real secret, test fixture.");
  });

  test("handles bullet entry missing location field", () => {
    const content = [
      "# Exceptions",
      "",
      "## False Positives",
      "",
      "- **Missing Location** — No file reference here. *2024-01-01*",
      "",
    ].join("\n");

    writeFileSync(oldFile, content);
    migrateExceptions();

    const result = readFileSync(join(exceptionsDir, "misreads.md"), "utf-8");
    expect(result).toContain("### Missing Location");
    expect(result).toContain("**Date:** 2024-01-01");
    // The entry itself should not have a Location line (template header does, but entry doesn't)
    const entrySection = result.split("### Missing Location")[1];
    expect(entrySection).not.toContain("**Location:**");
  });

  test("handles bullet entry missing date field", () => {
    const content = [
      "# Exceptions",
      "",
      "## False Positives",
      "",
      "- **No Date** — Some reason. (`src/foo.ts:1`)",
      "",
    ].join("\n");

    writeFileSync(oldFile, content);
    migrateExceptions();

    const result = readFileSync(join(exceptionsDir, "misreads.md"), "utf-8");
    expect(result).toContain("### No Date");
    expect(result).toContain("**Location:** `src/foo.ts:1`");
    // The entry itself should not have a Date line (template header does, but entry doesn't)
    const entrySection = result.split("### No Date")[1];
    expect(entrySection).not.toContain("**Date:**");
  });

  test("handles bullet entry missing both location and date", () => {
    const content = [
      "# Exceptions",
      "",
      "## Won't Fix",
      "",
      "- **Bare Entry** — Just a reason.",
      "",
    ].join("\n");

    writeFileSync(oldFile, content);
    migrateExceptions();

    const result = readFileSync(join(exceptionsDir, "risks.md"), "utf-8");
    expect(result).toContain("### Bare Entry");
    expect(result).toContain("**Reason:** Just a reason.");
    // The entry itself should have neither Location nor Date
    const entrySection = result.split("### Bare Entry")[1];
    expect(entrySection).not.toContain("**Location:**");
    expect(entrySection).not.toContain("**Date:**");
  });

  // ── Structured ### entries pass through ──────────────────────

  test("passes through already-structured ### entries unchanged", () => {
    const structuredEntry = [
      "### Already Structured",
      "",
      "**Location:** `lib/core.ts:99`",
      "**Date:** 2025-01-15",
      "",
      "**Reason:** This was already in the new format.",
    ].join("\n");

    const content = [
      "# Exceptions",
      "",
      "## Intentional Design Decisions",
      "",
      structuredEntry,
      "",
    ].join("\n");

    writeFileSync(oldFile, content);
    migrateExceptions();

    const result = readFileSync(join(exceptionsDir, "design.md"), "utf-8");
    expect(result).toContain("### Already Structured");
    expect(result).toContain("**Location:** `lib/core.ts:99`");
    expect(result).toContain("**Date:** 2025-01-15");
    expect(result).toContain("**Reason:** This was already in the new format.");
  });

  // ── Multiple sections aggregate into same target ─────────────

  test("aggregates entries from multiple sections into the same target file", () => {
    const content = [
      "# Exceptions",
      "",
      "## Won't Fix",
      "",
      "- **First Risk** — Reason one. (`a.ts:1`) *(2024-01-01)*",
      "",
      "## Deferred (Tracked in Backlog)",
      "",
      "- **Second Risk** — Reason two. (`b.ts:2`) *(2024-02-02)*",
      "",
    ].join("\n");

    writeFileSync(oldFile, content);
    migrateExceptions();

    const result = readFileSync(join(exceptionsDir, "risks.md"), "utf-8");
    expect(result).toContain("### First Risk");
    expect(result).toContain("### Second Risk");
  });

  // ── Multiple entries in a single section ─────────────────────

  test("handles multiple bullet entries in one section", () => {
    const content = [
      "# Exceptions",
      "",
      "## False Positives",
      "",
      "- **Entry A** — Reason A. (`a.ts:1`) *(2024-01-01)*",
      "- **Entry B** — Reason B. (`b.ts:2`) *(2024-02-02)*",
      "",
    ].join("\n");

    writeFileSync(oldFile, content);
    migrateExceptions();

    const result = readFileSync(join(exceptionsDir, "misreads.md"), "utf-8");
    expect(result).toContain("### Entry A");
    expect(result).toContain("### Entry B");
  });

  // ── Unknown sections are ignored ────────────────────────────

  test("ignores entries under unrecognized section headers", () => {
    const content = [
      "# Exceptions",
      "",
      "## Some Random Section",
      "",
      "- **Ignored Entry** — Should not appear. (`x.ts:1`) *(2024-01-01)*",
      "",
      "## False Positives",
      "",
      "- **Kept Entry** — Should appear. (`y.ts:2`) *(2024-03-03)*",
      "",
    ].join("\n");

    writeFileSync(oldFile, content);
    migrateExceptions();

    const misreads = readFileSync(join(exceptionsDir, "misreads.md"), "utf-8");
    expect(misreads).toContain("### Kept Entry");
    expect(misreads).not.toContain("Ignored Entry");

    const risks = readFileSync(join(exceptionsDir, "risks.md"), "utf-8");
    expect(risks).not.toContain("Ignored Entry");

    const design = readFileSync(join(exceptionsDir, "design.md"), "utf-8");
    expect(design).not.toContain("Ignored Entry");
  });
});
