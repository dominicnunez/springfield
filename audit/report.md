# Audit Report

### [Code Quality] Duplicate constant definition
- **Severity**: Low
- **File**: cli/src/engines/opencode.ts:8, cli/src/engines/claude.ts:7
- **Details**: The constant `SIGKILL_DELAY_MS = 5000` is defined identically in both engine files, violating DRY principle
- **Suggested fix**: Extract to a shared constants module (e.g., `src/engines/constants.ts`) and import in both engines

### [Bug] Empty branch name not validated in pushAfterCommit
- **Severity**: Medium
- **File**: cli/src/cli/commands/run.ts:110-122
- **Details**: The `branch` variable is obtained from `git rev-parse --abbrev-ref HEAD` without checking for errors. If git fails, `branch` will be an empty string, which is then passed to `git push`. Line 122 uses `branch` directly in pushArgs without validation
- **Suggested fix**: Validate that `branch` is non-empty before constructing pushArgs. Return early or log a warning if branch detection fails

### [Configuration] Missing validation for invalid engine type in config
- **Severity**: Low
- **File**: cli/src/config/loader.ts:190-193
- **Details**: The config loader silently ignores invalid engine types. If a user sets `type = invalid` in their config, no error is raised and the default engine is used. This could lead to confusion when config appears to have no effect
- **Suggested fix**: Consider logging a warning when an unknown engine type is encountered, or throwing an error to alert the user to fix their config

### [Code Quality] Hardcoded fallback for /tmp directory check
- **Severity**: Low
- **File**: cli/src/config/loader.ts:277
- **Details**: The path validation allows `/tmp` as an exception but the string "/tmp" is hardcoded inline rather than extracted to a named constant
- **Suggested fix**: Extract allowed paths to a constant array

### [Performance] Safety timeout hardcoded in two places despite shared constant
- **Severity**: Low
- **File**: cli/src/engines/opencode.ts:7, cli/src/engines/claude.ts:5, cli/src/engines/claude.ts:158
- **Details**: While SAFETY_TIMEOUT_MS is imported from opencode.ts in claude.ts, the comment at line 150-158 in claude.ts says "45 minutes max per step" inline. The constant is used correctly but the inline comment duplicates information already in the constant name
- **Suggested fix**: Remove inline comment or reference the constant in the comment

### [Bug] Race condition between HEAD check and push in pushAfterCommit
- **Severity**: Low
- **File**: cli/src/cli/commands/run.ts:100-136
- **Details**: The function checks headAfter at line 101 and later uses branch at line 122. There's a theoretical race condition where git state could change between these calls. However, this is a minor edge case
- **Suggested fix**: Consider capturing all required git state (head, branch, upstream) in a single operation or atomic batch

---

*Audit completed on 2026-02-21*
