import { describe, expect, test } from "bun:test";
import {
  EXCEPTION_ENTRY_EXAMPLE,
  EXCEPTION_FILE_DESCRIPTIONS,
  EXCEPTION_FILE_TEMPLATES,
} from "../exception-format.js";

describe("exception format", () => {
  test("uses the canonical no-date entry format", () => {
    expect(EXCEPTION_ENTRY_EXAMPLE).toBe(
      [
        "### Plain language description",
        "",
        "**Location:** `file/path:line` — optional context",
        "",
        "**Reason:** Explanation (can be multiple lines)",
      ].join("\n"),
    );
    expect(EXCEPTION_ENTRY_EXAMPLE).not.toContain("**Date:**");
  });

  test("all exception templates share the same entry format block", () => {
    for (const template of Object.values(EXCEPTION_FILE_TEMPLATES)) {
      expect(template).toContain("> Entry format:");
      expect(template).toContain(
        "> **Location:** `file/path:line` — optional context",
      );
      expect(template).toContain(
        "> **Reason:** Explanation (can be multiple lines)",
      );
      expect(template).not.toContain("**Date:**");
    }
  });

  test("exports canonical exception file descriptions", () => {
    expect(EXCEPTION_FILE_DESCRIPTIONS["risks.md"]).toContain(
      "not reasonably remediable in this repo",
    );
    expect(EXCEPTION_FILE_DESCRIPTIONS["misreads.md"]).toContain(
      "factually wrong",
    );
    expect(EXCEPTION_FILE_DESCRIPTIONS["design.md"]).toContain(
      "correct by design",
    );
  });
});
