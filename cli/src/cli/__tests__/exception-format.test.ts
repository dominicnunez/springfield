import { describe, expect, test } from "bun:test";
import {
  EXCEPTION_ENTRY_EXAMPLE,
  EXCEPTION_FALSE_POSITIVE_EXAMPLE,
  EXCEPTION_REASON_EXAMPLE,
} from "../exception-format.js";

describe("exception format", () => {
  test("uses the canonical line-only entry format", () => {
    expect(EXCEPTION_ENTRY_EXAMPLE).toBe(
      [
        "### Plain language description",
        "",
        "**Line:** `line` — optional context",
        "",
        "**Reason:** Explanation (can be multiple lines)",
      ].join("\n"),
    );
    expect(EXCEPTION_ENTRY_EXAMPLE).not.toContain("**Date:**");
    expect(EXCEPTION_ENTRY_EXAMPLE).not.toContain("**Location:**");
    expect(EXCEPTION_ENTRY_EXAMPLE).not.toContain("file/path");
  });

  test("exception examples use line-only entries", () => {
    expect(EXCEPTION_FALSE_POSITIVE_EXAMPLE).toContain("**Line:** `line`");
    expect(EXCEPTION_REASON_EXAMPLE).toContain("**Line:** `line`");
    expect(EXCEPTION_FALSE_POSITIVE_EXAMPLE).not.toContain("**Location:**");
    expect(EXCEPTION_REASON_EXAMPLE).not.toContain("**Location:**");
  });
});
