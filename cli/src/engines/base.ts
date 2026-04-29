import {
  EXCEPTION_FALSE_POSITIVE_EXAMPLE,
  EXCEPTION_REASON_EXAMPLE,
} from "../cli/exception-format.js";

export interface EngineResult {
  success: boolean;
  output: string;
  exitCode: number;
  rateLimited?: boolean;
  /** Hard rate limit: quota exhausted, billing issues - won't recover with waiting */
  hardRateLimited?: boolean;
  /** Soft rate limit: temporary cooldown - may recover after waiting */
  softRateLimited?: boolean;
}

export interface Engine {
  name: string;
  model: string;

  isAvailable(): boolean;
  run(prompt: string): Promise<EngineResult>;
  switchToFallback?(): boolean;
}

export const COMPLETE_MARKER = "<promise>COMPLETE</promise>";

const FIX_TESTS_PROMPT_MAX_LINES = 100;
const MIRRORED_EXCEPTION_FILE_EXAMPLE =
  "src/auth.ts -> audit/exceptions/src/auth.md";

const COMMIT_STANDARD = `## Commit Message Standard

Use conventional commits. Lowercase type, imperative mood, concise subject line.

Format:
\`\`\`
<type>: <subject>
<type>(<scope>): <subject>
<type>!: <subject>
<type>(<scope>)!: <subject>

[optional body — plain prose only, wrapped across multiple lines when long]

[optional BREAKING CHANGE: footer]
\`\`\`

Types:
- **feat:** new feature or capability
- **fix:** bug fix
- **refactor:** code change that neither fixes a bug nor adds a feature
- **test:** adding or updating tests
- **docs:** documentation only
- **chore:** maintenance, config, tooling
- **perf:** performance improvement
- **security:** security fix or hardening

Rules:
- Subject line: lowercase, imperative mood, no period, max ~72 chars
- Use \`!\` for breaking changes in the subject when applicable
- Add a body (separated by a blank line) only when the subject is not enough
- Body text must be plain prose, not labeled sections like \`Why:\`, \`What:\`, or \`Notes:\`
- Wrap longer bodies across multiple short lines instead of one long line
- Use a \`BREAKING CHANGE:\` footer when migration detail is needed
- One concern per commit — two things = two commits
- Do NOT add Co-Authored-By or AI attribution
- Do NOT reference audit report IDs, finding numbers, or internal file paths`;

export interface PromptOptions {
  skipCommit: boolean;
  progressFile: string;
}

export interface FixTestsPromptOptions {
  testOutput: string;
  skipCommit: boolean;
  progressFile: string;
}

const TEST_QUALITY_RULES = `## Test Quality Rules

Write tests that verify **behavior**, not implementation details:
- **DO:** Test inputs → outputs, side effects, error handling, edge cases
- **DON'T:** Test that a file exists, that a function is imported, that a component renders at all
- **DON'T:** Write structural/reflection tests (e.g., checking method names exist via reflect)
- **DON'T:** Create mocks that just return nil for everything — mocks should simulate real behavior
- **DON'T:** Add random suffixes to test names (US1, US2, _US3, TestUS4)
- **DO:** Use clear, descriptive test names: TestCalculateScore, TestCreateAppointment_DuplicateDate
- **DO:** Assert on actual values, not just "no error returned"
- **DO:** Test the interesting cases — conflicts, duplicates, empty inputs, boundaries
- Keep test count proportional to complexity — don't write 20 tests for a simple CRUD function`;

export function generatePrompt(options: PromptOptions): string {
  const { skipCommit, progressFile } = options;
  const commitInstructions = skipCommit
    ? `- If tests PASS:
  - Update PRD.md to mark the task complete (change [ ] to [x])
  - Do NOT commit any changes in this run
  - Append what worked to ${progressFile}`
    : `- If tests PASS:
  - Update PRD.md to mark the task complete (change [ ] to [x])
  - Commit your changes following the commit standard below
  - Append what worked to ${progressFile}`;

  return `You are Ralph, an autonomous coding agent. Do exactly ONE task per iteration.

## Steps

1. Read PRD.md and find the first task that is NOT complete (marked [ ]).
2. Read ${progressFile} - check the Learnings section first for patterns from previous iterations.
3. Implement that ONE task only.
4. **CRITICAL: You MUST write tests for your implementation.**
5. **CRITICAL: You MUST run tests and ensure ALL tests pass.**

## Test Requirement (MANDATORY)

You MUST:
- Create or modify a test file (e.g., *.test.ts, *.spec.ts)
- Write tests for the feature you implement
- Run the full test suite
- Verify ALL tests pass before marking the task complete

If you do not write tests, the task will be rejected and you must try again.

${TEST_QUALITY_RULES}

## Only Complete If Tests Pass

${commitInstructions}

- If tests FAIL:
  - Do NOT mark the task complete
  - Do NOT commit broken code
  - Append what went wrong to ${progressFile} (so next iteration can learn)

## Progress Notes Format

Append to ${progressFile} using this format:

## Iteration [N] - [Task Name]
- What was implemented
- Test file created/modified: [filename]
- Tests written: [brief description]
- Test results: PASS/FAIL
- Files changed
- Learnings for future iterations
---

## Update AGENTS.md (If Applicable)

If you discover a reusable pattern that future work should know about:
- Check if AGENTS.md exists in the project root
- Add patterns like: 'This codebase uses X for Y' or 'Always do Z when changing W'
- Only add genuinely reusable knowledge, not task-specific details

${COMMIT_STANDARD}

## End Condition

After completing your task, check PRD.md:
- If ALL tasks are [x], output exactly: ${COMPLETE_MARKER}
- If tasks remain [ ], just end your response (next iteration will continue)`;
}

export function generateSingleTaskPrompt(
  task: string,
  options: PromptOptions,
): string {
  const { skipCommit, progressFile } = options;
  const commitInstructions = skipCommit
    ? `- If tests PASS:
  - Do NOT update PRD.md (single-task mode)
  - Do NOT commit any changes in this run
  - Append what worked to ${progressFile}`
    : `- If tests PASS:
  - Do NOT update PRD.md (single-task mode)
  - Commit your changes following the commit standard below
  - Append what worked to ${progressFile}`;

  return `You are Ralph, an autonomous coding agent. Do exactly ONE task per iteration.

## Single Task

You must complete this task:
"${task}"

## In-Memory PRD

- [ ] ${task}

Do NOT create or modify PRD.md on disk.

## Steps

1. Read ${progressFile} - check the Learnings section first for patterns from previous iterations.
2. Implement the single task above only.
3. **CRITICAL: You MUST write tests for your implementation.**
4. **CRITICAL: You MUST run tests and ensure ALL tests pass.**

## Test Requirement (MANDATORY)

You MUST:
- Create or modify a test file (e.g., *.test.ts, *.spec.ts)
- Write tests for the feature you implement
- Run the full test suite
- Verify ALL tests pass before marking the task complete

If you do not write tests, the task will be rejected and you must try again.

${TEST_QUALITY_RULES}

## Only Complete If Tests Pass

${commitInstructions}

- If tests FAIL:
  - Do NOT commit broken code
  - Append what went wrong to ${progressFile} (so next iteration can learn)

## Progress Notes Format

Append to ${progressFile} using this format:

## Iteration [N] - [Task Name]
- What was implemented
- Test file created/modified: [filename]
- Tests written: [brief description]
- Test results: PASS/FAIL
- Files changed
- Learnings for future iterations
---

## Update AGENTS.md (If Applicable)

If you discover a reusable pattern that future work should know about:
- Check if AGENTS.md exists in the project root
- Add patterns like: 'This codebase uses X for Y' or 'Always do Z when changing W'
- Only add genuinely reusable knowledge, not task-specific details

${COMMIT_STANDARD}

## End Condition

After completing your task, output exactly: ${COMPLETE_MARKER}`;
}

export function generateFixTestsPrompt(options: FixTestsPromptOptions): string {
  const { testOutput, skipCommit, progressFile } = options;

  const lines = testOutput.split("\n");
  const truncatedOutput = lines.slice(-FIX_TESTS_PROMPT_MAX_LINES).join("\n");

  const commitInstructions = skipCommit
    ? `- If tests PASS:
  - Update PRD.md to mark the task complete (change [ ] to [x])
  - Do NOT commit any changes in this run
  - Append what worked to ${progressFile}`
    : `- If tests PASS:
  - Update PRD.md to mark the task complete (change [ ] to [x])
  - Commit your changes following the commit standard below
  - Append what worked to ${progressFile}`;

  return `You are Ralph, an autonomous coding agent. Your ONLY task is to FIX THE FAILING TESTS.

## PRIORITY: FIX FAILING TESTS

The previous iteration failed because tests did not pass. You MUST fix the failing tests before doing anything else.

## Test Failure Output

\`\`\`
${truncatedOutput}
\`\`\`

## Steps

1. Read the test failure output above carefully.
2. Read ${progressFile} - check what was attempted and what failed.
3. Identify WHY the tests are failing (look at the error messages).
4. Fix the code or tests to make ALL tests pass.
5. Run the full test suite to verify ALL tests pass.

## Rules

- Do NOT implement new features
- Do NOT mark any tasks complete until tests pass
- Do NOT commit any code until tests pass
- Focus ONLY on making the existing tests pass

## After Fixing

${commitInstructions}

- Append what you fixed to ${progressFile} with format:

## Fix Attempt - Iteration [N]
- Error identified: [what was wrong]
- Fix applied: [what you changed]
- Test results: PASS/FAIL
---

${COMMIT_STANDARD}

## End Condition

After fixing and tests pass, check PRD.md:
- If ALL tasks are [x], output exactly: ${COMPLETE_MARKER}
- If tasks remain [ ], just end your response (next iteration will continue)`;
}

// ─────────────────────────────────────────────────────────────
// Willie (audit) prompts
// ─────────────────────────────────────────────────────────────

export const DEFAULT_AUDIT_PROMPT = `Audit the selected source scope for security vulnerabilities, bugs, performance issues, and code quality problems.

Rules:
1. Read entrypoints inside the selected source scope and follow in-scope imports to understand structure. Read in-scope test files to identify what is and isn't covered.
2. Check for problems in these areas:
   - **Security:** injection flaws, auth issues, data exposure, missing input validation
   - **Correctness:** logic errors, race conditions, error handling gaps, missing error context at package boundaries
   - **Maintainability:** misleading comments, dead code/config, magic numbers that should be named constants, misconfigurations
   - **Testing:** see rule 7
3. Include ALL real findings regardless of fix difficulty — small fixes (wrong comments, dead config, missing constants) are valid findings. The fix step decides effort, not the audit step.
4. Write findings to audit/report.md. You MUST use the write tool. Use this EXACT format for each finding:

### [Security] Hardcoded credentials in source
- **Severity**: Critical
- **File**: auth.go:42
- **Details**: Password is hardcoded instead of using environment variables
- **Suggested fix**: Load from environment variable using os.Getenv

Categories: Security, Bug, Performance, Code Quality, Error Handling, Configuration, Testing

The format is critical: "### [Category]" with brackets, then severity/file/details/fix on separate lines.
5. If no issues found, do not create audit/report.md
6. Check tests for:
   - Untested error handling, security boundaries, and data validation (not every uncovered branch — focus on paths where a bug would cause real damage)
   - Cruft tests that test implementation details instead of behavior (mocking internals, asserting on log output, snapshot tests of serialization formats)
   - Tests that pass but verify nothing meaningful (empty assertions, tautologies, verbatim duplicates of other tests)
   - Stale tests that reference removed or renamed code
7. Before writing audit/report.md, inspect the mirrored exception file for each candidate finding as needed (${MIRRORED_EXCEPTION_FILE_EXAMPLE}). Read only the exception files and entries needed to rule in or rule out that finding. Exception entries use **Line:** only because the mirrored exception file path identifies the source file. Do not re-report findings that are already covered by a still-applicable exception.`;

export const VALIDATE_PROMPT = `Review and validate or invalidate each item in audit/report.md. Be thorough — actually read the code at every referenced file:line. Do not just trust the audit description.

Rules:
1. Read the actual code at the referenced file:line
2. Classify each finding as one of:
   - REAL REMEDIATION: the issue exists and has a concrete code, test, config, or doc fix in this repo
   - FALSE POSITIVE: the audit misread the code, missed existing handling, or described behavior that doesn't actually occur
   - CORRECT-BY-DESIGN EXCEPTION: the finding describes real behavior, but the current behavior is intentional, defensible, and should not be changed
3. A finding that is real but "minor", "broad", "low priority", "easy to fix", or "not worth this session" is NOT a false positive and is NOT correct-by-design — keep it in the report
4. Move only FALSE POSITIVE and CORRECT-BY-DESIGN EXCEPTION findings to the mirrored exception file for the reported source file (${MIRRORED_EXCEPTION_FILE_EXAMPLE}) using this exact format:

\`\`\`
${EXCEPTION_FALSE_POSITIVE_EXAMPLE}
\`\`\`

   Create parent directories as needed. The exception file path identifies the source file; include only the line number in the entry.
   Do NOT include audit report IDs, finding numbers, or category labels — plain language only
5. If a finding describes a repo-controlled problem with a concrete remediation path in this codebase, it remains a REAL REMEDIATION finding for the fix step unless it is a FALSE POSITIVE or CORRECT-BY-DESIGN EXCEPTION
6. For testing findings (missing coverage, cruft tests), verify the claim by reading the test files — confirm the gap actually exists or the test actually has the described problem. Weak or source-oriented tests are still real findings when the claimed weakness exists. Do not rubber-stamp testing findings.
7. Remove invalidated items from audit/report.md
8. If ALL items are invalidated, delete audit/report.md entirely
9. Do not reference finding IDs or category labels in commit messages`;

export interface FixPromptOptions {
  testCmd: string | undefined;
  lintCmd: string | undefined;
  pushAfterFix: boolean;
}

export function generateFixPrompt(options: FixPromptOptions): string {
  const { testCmd, lintCmd, pushAfterFix } = options;

  let verifyInstructions: string;
  if (testCmd && lintCmd) {
    verifyInstructions = `8. Before finishing, run lint and tests. Fix any failures your changes introduced. Do not finish with lint warnings or test failures.
   - Lint: \`${lintCmd}\`
   - Test: \`${testCmd}\``;
  } else if (testCmd) {
    verifyInstructions = `8. Before finishing, run tests: \`${testCmd}\`. Fix any failures your changes introduced. Do not finish with test failures. No lint command detected — skip linting.`;
  } else if (lintCmd) {
    verifyInstructions = `8. Before finishing, run lint: \`${lintCmd}\`. Fix any failures your changes introduced. Do not finish with lint warnings. No test command detected — skip testing.`;
  } else {
    verifyInstructions = `8. No lint or test command detected — skip verification. If you know how to run them for this project, do so manually.`;
  }

  const completionInstructions = pushAfterFix
    ? `9. Delete audit/report.md when 100% resolved, then push committed changes.`
    : `9. Delete audit/report.md when 100% resolved. Do NOT push changes; Willie push-after-fix is disabled in config.`;

  return `Fix the issues in audit/report.md. Do proper long-term fixes, not quick-fix bandaids. Do not leave the report behind — either fix everything or move remaining items to mirrored files under audit/exceptions/.

Rules:
1. Do proper long-term fixes, not quick-fix bandaids
2. **Fix-effort rule:** If a finding can be fixed in the current session (wrong comments, missing constants, dead config, incomplete test coverage, trivial code cleanup), FIX IT. Do not punt easy fixes to exceptions.
3. Do not write an exception for any finding with a concrete code, test, config, or doc remediation in this repo. Do the fix instead.
4. Only move an item to audit/exceptions/ when no concrete repo fix is appropriate and one of these exception classes applies:
   - The finding requires architectural changes disproportionate to its severity
   - There is a genuine design tradeoff where the current approach is defensible
   - The finding is about external constraints you cannot change (transitive deps, upstream bugs)
   - "Disproportionate for this session" alone is NOT enough
   - Missing or weak tests, dead code, misleading comments, local config cleanup, validation gaps, and other repo-controlled maintenance work do NOT belong in exceptions
5. When adding to exceptions, append to the mirrored exception file for the reported source file (${MIRRORED_EXCEPTION_FILE_EXAMPLE}) using this format:

\`\`\`
${EXCEPTION_REASON_EXAMPLE}
\`\`\`

   Create parent directories as needed. The exception file path identifies the source file; include only the line number in each entry.
   Do NOT include audit report IDs, finding numbers, or category labels — plain language only
6. Commit each fix following the commit standard below.
7. Do not reference finding IDs, report categories, or audit/report.md in commit messages.
${verifyInstructions}
${completionInstructions}

${COMMIT_STANDARD}`;
}
