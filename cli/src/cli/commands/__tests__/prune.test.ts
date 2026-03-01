import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initLogger } from "../../../ui/logger.js";
import { parseArgs } from "../../args.js";
import {
  type ExceptionFile,
  parseExceptionFile,
  rebuildFile,
} from "../prune.js";

// ─────────────────────────────────────────────────────────────
// parseExceptionFile
// ─────────────────────────────────────────────────────────────

describe("parseExceptionFile", () => {
  test("extracts heading, location from well-formed entries", () => {
    const content = [
      "# Risks",
      "",
      "> Some header text",
      "",
      "### Hardcoded timeout in retry loop",
      "",
      "**Location:** `src/retry.ts:42` — retry handler",
      "**Date:** 2025-01-15",
      "",
      "**Reason:** Timeout is intentional for rate limiting.",
    ].join("\n");

    const result = parseExceptionFile("audit/exceptions/risks.md", content);

    expect(result.path).toBe("audit/exceptions/risks.md");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].heading).toBe("Hardcoded timeout in retry loop");
    expect(result.entries[0].location).toBe("src/retry.ts");
  });

  test("handles entries without Location field", () => {
    const content = [
      "# Misreads",
      "",
      "### General architecture concern",
      "",
      "**Date:** 2025-02-01",
      "",
      "**Reason:** This is a design choice.",
    ].join("\n");

    const result = parseExceptionFile("audit/exceptions/misreads.md", content);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].heading).toBe("General architecture concern");
    expect(result.entries[0].location).toBeUndefined();
  });

  test("handles multi-line Reason fields", () => {
    const content = [
      "# Design",
      "",
      "### Complex design choice",
      "",
      "**Location:** `lib/core.ts:10`",
      "**Date:** 2025-03-01",
      "",
      "**Reason:** First line of reason.",
      "Second line continues the explanation.",
      "Third line wraps up.",
    ].join("\n");

    const result = parseExceptionFile("audit/exceptions/design.md", content);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].rawText).toContain("Second line continues");
    expect(result.entries[0].rawText).toContain("Third line wraps up.");
  });

  test("parses multiple entries from one file", () => {
    const content = [
      "# Risks",
      "",
      "### Entry one",
      "",
      "**Location:** `a.ts:1`",
      "",
      "### Entry two",
      "",
      "**Location:** `b.ts:2`",
      "",
      "### Entry three",
      "",
      "**Reason:** No location here.",
    ].join("\n");

    const result = parseExceptionFile("risks.md", content);

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].heading).toBe("Entry one");
    expect(result.entries[0].location).toBe("a.ts");
    expect(result.entries[1].heading).toBe("Entry two");
    expect(result.entries[1].location).toBe("b.ts");
    expect(result.entries[2].heading).toBe("Entry three");
    expect(result.entries[2].location).toBeUndefined();
  });

  test("preserves header content before first entry", () => {
    const content = [
      "# Risks",
      "",
      "> Some blockquote header",
      "> with multiple lines",
      "",
      "### First entry",
      "",
      "**Reason:** something",
    ].join("\n");

    const result = parseExceptionFile("risks.md", content);

    expect(result.header).toContain("# Risks");
    expect(result.header).toContain("> Some blockquote header");
    expect(result.header).not.toContain("### First entry");
  });

  test("treats entire content as header when no entries exist", () => {
    const content = ["# Empty File", "", "> Template header only"].join("\n");

    const result = parseExceptionFile("empty.md", content);

    expect(result.entries).toHaveLength(0);
    expect(result.header).toBe(content);
  });
});

// ─────────────────────────────────────────────────────────────
// Deterministic file-existence check (integration via prune flow)
// ─────────────────────────────────────────────────────────────

describe("deterministic file-existence check", () => {
  let originalCwd: string;
  let tempRoot: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempRoot = mkdtempSync(join(tmpdir(), "prune-test-"));
    process.chdir(tempRoot);
    initLogger({});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    initLogger({});
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("entry with location pointing to existing file is not flagged", () => {
    mkdirSync(join(tempRoot, "src"), { recursive: true });
    writeFileSync(join(tempRoot, "src", "exists.ts"), "export const x = 1;");

    const content = [
      "# Risks",
      "",
      "### Entry pointing to existing file",
      "",
      "**Location:** `src/exists.ts:10`",
      "**Reason:** Some reason.",
    ].join("\n");

    const file = parseExceptionFile("risks.md", content);
    // The entry's location is "src/exists.ts" — file exists
    expect(file.entries[0].location).toBe("src/exists.ts");

    // Verify the file exists from cwd
    const { existsSync } = require("node:fs");
    expect(existsSync("src/exists.ts")).toBe(true);
  });

  test("entry with location pointing to deleted file would be flagged", () => {
    // Don't create the referenced file
    const content = [
      "# Risks",
      "",
      "### Entry pointing to deleted file",
      "",
      "**Location:** `src/deleted.ts:5`",
      "**Reason:** Some reason.",
    ].join("\n");

    const file = parseExceptionFile("risks.md", content);
    expect(file.entries[0].location).toBe("src/deleted.ts");

    const { existsSync } = require("node:fs");
    expect(existsSync("src/deleted.ts")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// rebuildFile — removal
// ─────────────────────────────────────────────────────────────

describe("rebuildFile", () => {
  test("removes stale entries while preserving header and remaining entries", () => {
    const file: ExceptionFile = {
      path: "risks.md",
      header: "# Risks\n\n> Header text",
      entries: [
        {
          heading: "Keep this",
          location: "a.ts",
          rawText: "### Keep this\n\n**Location:** `a.ts:1`\n**Reason:** Good",
        },
        {
          heading: "Remove this",
          location: "b.ts",
          rawText:
            "### Remove this\n\n**Location:** `b.ts:2`\n**Reason:** Stale",
        },
        {
          heading: "Also keep",
          rawText: "### Also keep\n\n**Reason:** Still valid",
        },
      ],
    };

    const toRemove = new Set([
      "### Remove this\n\n**Location:** `b.ts:2`\n**Reason:** Stale",
    ]);

    const result = rebuildFile(file, toRemove);

    expect(result).toContain("# Risks");
    expect(result).toContain("> Header text");
    expect(result).toContain("### Keep this");
    expect(result).toContain("### Also keep");
    expect(result).not.toContain("### Remove this");
  });

  test("preserves only header when all entries removed", () => {
    const file: ExceptionFile = {
      path: "risks.md",
      header: "# Risks\n\n> Header",
      entries: [
        {
          heading: "Only entry",
          rawText: "### Only entry\n\n**Reason:** Gone",
        },
      ],
    };

    const toRemove = new Set(["### Only entry\n\n**Reason:** Gone"]);
    const result = rebuildFile(file, toRemove);

    expect(result).toBe("# Risks\n\n> Header\n");
    expect(result).not.toContain("### Only entry");
  });
});

// ─────────────────────────────────────────────────────────────
// Args parsing
// ─────────────────────────────────────────────────────────────

describe("sfk prune args", () => {
  test("parses 'sfk prune' as prune command", () => {
    const result = parseArgs(["node", "sfk", "prune"]);
    expect(result.command).toBe("prune");
  });

  test("parses 'sfk prune -v' with verbose flag", () => {
    const result = parseArgs(["node", "sfk", "prune", "-v"]);
    expect(result.command).toBe("prune");
    expect(result.pruneOptions.verbose).toBe(true);
  });

  test("parses 'sfk prune --verbose' with verbose flag", () => {
    const result = parseArgs(["node", "sfk", "prune", "--verbose"]);
    expect(result.command).toBe("prune");
    expect(result.pruneOptions.verbose).toBe(true);
  });
});
