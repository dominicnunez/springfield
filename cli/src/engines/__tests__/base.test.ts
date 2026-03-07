import { describe, expect, test } from "bun:test";
import { EXCEPTION_FILE_DESCRIPTIONS } from "../../cli/exception-format.js";
import { generateFixPrompt, VALIDATE_PROMPT } from "../base.js";

describe("Willie audit prompts", () => {
  test("validate prompt keeps repo-controlled findings in the report", () => {
    expect(VALIDATE_PROMPT).toContain(
      "If a finding describes a repo-controlled problem with a concrete remediation path in this codebase, it remains a real finding for the fix step",
    );
    expect(VALIDATE_PROMPT).toContain(
      '"not worth this session" is NOT a false positive',
    );
    expect(VALIDATE_PROMPT).toContain(
      "Weak or source-oriented tests are still real findings when the claimed weakness exists.",
    );
  });

  test("fix prompt forbids punting repo-controlled work to risks", () => {
    const prompt = generateFixPrompt({
      testCmd: "bun test",
      lintCmd: "bun run lint",
    });

    expect(prompt).toContain(
      "If you can describe concrete code, test, config, or doc changes in this repo that would remediate the finding, do the fix instead of writing an exception",
    );
    expect(prompt).toContain(
      "Missing or weak tests, dead code, misleading comments, local config cleanup, validation gaps, and other repo-controlled maintenance work do NOT belong in risks.md",
    );
    expect(prompt).toContain(
      `risks.md — ${EXCEPTION_FILE_DESCRIPTIONS["risks.md"]}`,
    );
    expect(prompt).toContain(
      `misreads.md — ${EXCEPTION_FILE_DESCRIPTIONS["misreads.md"]}`,
    );
    expect(prompt).toContain(
      `design.md — ${EXCEPTION_FILE_DESCRIPTIONS["design.md"]}`,
    );
  });
});
