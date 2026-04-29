import { describe, expect, test } from "bun:test";
import {
  DEFAULT_AUDIT_PROMPT,
  generateFixPrompt,
  generatePrompt,
  VALIDATE_PROMPT,
} from "../base.js";

describe("Willie audit prompts", () => {
  test("audit prompt checks exceptions before writing the report", () => {
    expect(DEFAULT_AUDIT_PROMPT).toContain(
      "Before writing audit/report.md, inspect the mirrored exception file for each candidate finding as needed",
    );
    expect(DEFAULT_AUDIT_PROMPT).toContain(
      "Read only the exception files and entries needed to rule in or rule out that finding.",
    );
    expect(DEFAULT_AUDIT_PROMPT).toContain(
      "Exception entries use **Line:** only because the mirrored exception file path identifies the source file.",
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
      "Missing or weak tests, dead code, misleading comments, local config cleanup, validation gaps, and other repo-controlled maintenance work do NOT belong in exceptions",
    );
    expect(prompt).toContain(
      "append to the mirrored exception file for the reported source file",
    );
    expect(prompt).toContain("src/auth.ts -> audit/exceptions/src/auth.md");
    expect(prompt).not.toContain("risks.md");
    expect(prompt).not.toContain("misreads.md");
    expect(prompt).not.toContain("design.md");
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
