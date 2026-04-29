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
      "Before writing audit/report.md, inspect the categorized mirrored exception files for each candidate finding as needed",
    );
    expect(DEFAULT_AUDIT_PROMPT).toContain(
      "Read only the exception files and entries needed to rule in or rule out that finding.",
    );
    expect(DEFAULT_AUDIT_PROMPT).toContain(
      "Exception entries use **Line:** only because the categorized mirrored exception file path identifies the exception category and source file.",
    );
    expect(DEFAULT_AUDIT_PROMPT).toContain(
      "Do not re-report findings that are already covered by a still-applicable exception.",
    );
  });

  test("validate prompt keeps repo-controlled findings in the report", () => {
    expect(VALIDATE_PROMPT).toContain(
      "If a finding describes a repo-controlled problem with a concrete remediation path in this codebase, it remains a REAL REMEDIATION finding for the fix step",
    );
    expect(VALIDATE_PROMPT).toContain("CORRECT-BY-DESIGN EXCEPTION");
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
      pushAfterFix: false,
    });

    expect(prompt).toContain(
      "Do not write an exception for any finding with a concrete code, test, config, or doc remediation in this repo. Do the fix instead.",
    );
    expect(prompt).toContain(
      "Missing or weak tests, dead code, misleading comments, local config cleanup, validation gaps, and other repo-controlled maintenance work do NOT belong in exceptions",
    );
    expect(prompt).toContain(
      "append to the appropriate categorized mirrored exception file for the reported source file",
    );
    expect(prompt).toContain("src/auth.ts -> audit/misreads/src/auth.md");
    expect(prompt).toContain("audit/design/src/auth.md");
    expect(prompt).toContain("audit/risks/src/auth.md");
    expect(prompt).not.toContain("risks.md");
    expect(prompt).not.toContain("misreads.md");
    expect(prompt).not.toContain("design.md");
  });

  test("fix prompt gates pushing on Willie config", () => {
    const noPushPrompt = generateFixPrompt({
      testCmd: undefined,
      lintCmd: undefined,
      pushAfterFix: false,
    });
    const pushPrompt = generateFixPrompt({
      testCmd: undefined,
      lintCmd: undefined,
      pushAfterFix: true,
    });

    expect(noPushPrompt).toContain("Do NOT push changes");
    expect(noPushPrompt).toContain("push-after-fix is disabled");
    expect(pushPrompt).toContain("push committed changes");
  });

  test("fix prompt asks Willie to group commits semantically", () => {
    const prompt = generateFixPrompt({
      testCmd: undefined,
      lintCmd: undefined,
      pushAfterFix: false,
    });

    expect(prompt).toContain("Commit resolved work in semantic groups");
    expect(prompt).toContain(
      "Group fixes that address the same underlying issue, behavior, module, or config surface into one commit.",
    );
    expect(prompt).toContain(
      "Do not make one commit per file or per audit finding when the changes are part of the same coherent fix.",
    );
    expect(prompt).toContain("One coherent change set per commit");
  });

  test("fix prompt uses Willie plain two-paragraph commit messages", () => {
    const prompt = generateFixPrompt({
      testCmd: undefined,
      lintCmd: undefined,
      pushAfterFix: false,
    });

    expect(prompt).toContain("## Willie Commit Message Standard");
    expect(prompt).toContain(
      "Use a plain commit message with a one-sentence what line, a blank line,",
    );
    expect(prompt).toContain("<single sentence describing what changed>");
    expect(prompt).toContain("<plain description of why it changed>");
    expect(prompt).toContain(
      "First line: exactly one plain sentence describing what changed",
    );
    expect(prompt).toContain(
      "Aim to keep the what line and wrapped why lines around 75 characters",
    );
    expect(prompt).toContain(
      "Do NOT use type prefixes, scopes, labels, bullets, or trailers",
    );
    expect(prompt).not.toContain("<type>: <subject>");
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
