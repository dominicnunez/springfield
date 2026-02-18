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
  - Commit your changes with message: feat: [task description] (do NOT add Co-Authored-By)
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
  - Commit your changes with message: feat: [task description] (do NOT add Co-Authored-By)
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

## End Condition

After completing your task, output exactly: ${COMPLETE_MARKER}`;
}

export function generateFixTestsPrompt(options: FixTestsPromptOptions): string {
  const { testOutput, skipCommit, progressFile } = options;

  const lines = testOutput.split("\n");
  const truncatedOutput = lines.slice(-100).join("\n");

  const commitInstructions = skipCommit
    ? `- If tests PASS:
  - Update PRD.md to mark the task complete (change [ ] to [x])
  - Do NOT commit any changes in this run
  - Append what worked to ${progressFile}`
    : `- If tests PASS:
  - Update PRD.md to mark the task complete (change [ ] to [x])
  - Commit your changes with message: feat: [task description] (do NOT add Co-Authored-By)
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

## End Condition

After fixing and tests pass, check PRD.md:
- If ALL tasks are [x], output exactly: ${COMPLETE_MARKER}
- If tasks remain [ ], just end your response (next iteration will continue)`;
}

// ─────────────────────────────────────────────────────────────
// Willie (audit) prompts
// ─────────────────────────────────────────────────────────────

export const DEFAULT_AUDIT_PROMPT = `Audit this codebase for security vulnerabilities, bugs, performance issues, and code quality problems.

Rules:
1. Read the project structure and key source files thoroughly
2. Check for: injection flaws, auth issues, data exposure, misconfigurations, error handling gaps, race conditions, resource leaks, and logic errors
3. Check audit/exceptions.md — do not re-flag items already listed there
4. Write findings to audit/report.md using this format for each finding:

### [Category] Brief description
- **Severity**: Critical / High / Medium / Low
- **File**: path/to/file:line
- **Details**: What the issue is and why it matters
- **Suggested fix**: How to resolve it

Categories: Security, Bug, Performance, Code Quality, Error Handling, Configuration

5. If no issues found, do not create audit/report.md`;

export const VALIDATE_PROMPT = `Review and validate or invalidate each item in audit/report.md. Be thorough — actually read the code at every referenced file:line. Do not just trust the audit description.

Rules:
1. Read the actual code at the referenced file:line
2. Determine if the issue is real (valid) or a false positive (invalidate)
3. Move any false positives to audit/exceptions.md with a "date added" field and brief reasoning
4. Remove invalidated items from audit/report.md
5. If ALL items are invalidated, delete audit/report.md entirely
6. Do not reference finding IDs or category labels in commit messages`;

export const FIX_PROMPT = `Fix the issues in audit/report.md. Do proper long-term fixes, not quick-fix bandaids. Do not leave the report behind — either fix everything or move remaining items to audit/exceptions.md.

Rules:
1. Do proper long-term fixes, not quick-fix bandaids
2. Anything worth fixing later is valid and should be done now
3. Anything truly acceptable/wont-fix: add to audit/exceptions.md with date added and reasoning
4. Semantically commit each fix with a descriptive message (push-after-commit is enabled)
5. Write commit messages as a developer would — describe what you fixed and why. Do not reference finding IDs, report categories, or audit/report.md in commit messages.
6. Delete audit/report.md when 100% resolved and push`;
