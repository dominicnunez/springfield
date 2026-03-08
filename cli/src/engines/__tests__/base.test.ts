import { describe, expect, test } from "bun:test";
import { EXCEPTION_FILE_DESCRIPTIONS } from "../../cli/exception-format.js";
import {
  DEFAULT_AUDIT_PROMPT,
  generateFixPrompt,
  generatePrompt,
  VALIDATE_PROMPT,
} from "../base.js";

describe("Willie audit prompts", () => {
  test("audit prompt checks exceptions before writing the report", () => {
    expect(DEFAULT_AUDIT_PROMPT).toContain(
      "Before writing audit/report.md, inspect audit/exceptions/*.md as needed and compare each candidate finding against relevant exception entries.",
    );
    expect(DEFAULT_AUDIT_PROMPT).toContain(
      "Read only the exception files and entries needed to rule in or rule out that finding.",
    );
    expect(DEFAULT_AUDIT_PROMPT).toContain(
      "Do not re-report findings that are already covered by a still-applicable exception.",
    );
  });

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

  test("ralph prompt defines plain prose conventional commit bodies", () => {
    const prompt = generatePrompt({
      skipCommit: false,
      progressFile: "/tmp/progress.md",
    });

    expect(prompt).toContain("<type>!: <subject>");
    expect(prompt).toContain("<type>(<scope>)!: <subject>");
    expect(prompt).toContain(
      "[optional body — plain prose only, wrapped across multiple lines when long]",
    );
    expect(prompt).toContain(
      "Body text must be plain prose, not labeled sections like `Why:`, `What:`, or `Notes:`",
    );
    expect(prompt).toContain(
      "Wrap longer bodies across multiple short lines instead of one long line",
    );
    expect(prompt).toContain(
      "Use a `BREAKING CHANGE:` footer when migration detail is needed",
    );
  });
});
