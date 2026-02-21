# Audit Exceptions

> Items validated as false positives or accepted as won't-fix.
> Managed by willie audit loop. Do not edit format manually.
>
> Entry format:
> ### Plain language description
> **Location:** `file/path:line` — optional context
> **Date:** YYYY-MM-DD
> **Reason:** Explanation (can be multiple lines)

### Unhandled file deletion errors in run.ts

**Location:** `cli/src/cli/commands/run.ts:266`
**Date:** 2026-02-21

**Reason:** Already wrapped in try-catch at lines 271-275. The audit incorrectly stated there was no error handling.

### Unhandled file deletion errors in run.ts (second occurrence)

**Location:** `cli/src/cli/commands/run.ts:492`
**Date:** 2026-02-21

**Reason:** Already wrapped in try-catch at lines 501-505. Same as above - error handling already exists.

### Unhandled file write errors in logger.ts

**Location:** `cli/src/ui/logger.ts:32`
**Date:** 2026-02-21

**Reason:** Already wrapped in try-catch at lines 32-36. The writeToLogFile function has proper error handling that logs to stderr as fallback.

### Unhandled file write errors in logger.ts (logSessionStart)

**Location:** `cli/src/ui/logger.ts:101`
**Date:** 2026-02-21

**Reason:** Already wrapped in try-catch at lines 105-111. Error handling exists.

### Unhandled file append errors in progress.ts

**Location:** `cli/src/tasks/progress.ts:47`
**Date:** 2026-02-21

**Reason:** Already wrapped in try-catch at lines 47-51. Error handling exists.

### Silent error swallowing in notify function

**Location:** `cli/src/cli/commands/run.ts:84-95`
**Date:** 2026-02-21

**Reason:** The catch block at lines 93-95 already logs the error at debug level. The audit incorrectly described it as an empty catch block.

### Silent error swallowing in audit.ts notify

**Location:** `cli/src/cli/commands/audit.ts:74-86`
**Date:** 2026-02-21

**Reason:** Already logs at info level in catch block at line 84. Error handling exists.

### Shell injection risk in test command execution

**Location:** `cli/src/tasks/verification.ts:167`
**Date:** 2026-02-21

**Reason:** The code does NOT use shell: true. Lines 167-175 show the command is properly split with `testCmd.split(/\s+/)` and executed as separate arguments, preventing shell injection.

### Magic string for default OpenCode model

**Location:** `cli/src/config/loader.ts:336`
**Date:** 2026-02-21

**Reason:** The constant DEFAULT_OC_PRIME_MODEL is already defined at line 8 and used at line 353. The audit line reference was slightly off but the fix was already in place.

### Invalid step validation exits without proper cleanup

**Location:** `cli/src/cli/args.ts:131-135`
**Date:** 2026-02-21

**Reason:** The code throws an Error (line 132) rather than calling process.exit(1) directly. This is proper error handling that can be caught by callers.

### getHeadSha returns empty string on git failure

**Location:** `cli/src/cli/commands/run.ts:135-140`
**Date:** 2026-02-21

**Reason:** The function already returns null on error (lines 141-143), not an empty string. This was already fixed.

### parseBool accepts "0" as false

**Location:** `cli/src/config/loader.ts:165-169`
**Date:** 2026-02-21

**Reason:** The parseBool function only accepts "true" and "false" strings (lines 167-171). It does NOT accept "0" or "1". The audit misread the code.

### Section header regex too restrictive

**Location:** `cli/src/config/loader.ts:109`
**Date:** 2026-02-21

**Reason:** The regex at line 111 is `/^\[([a-zA-Z-]+)\]$/` which already allows uppercase letters. This was already fixed.

### Missing bounds check on parseInt results

**Location:** `cli/src/config/loader.ts:202-204`
**Date:** 2026-02-21

**Reason:** The code uses parseIntSafe function (lines 173-176) which already validates for NaN and returns a default value. This was already fixed.

### Windows command detection incomplete

**Location:** `cli/bin.js:44-52`
**Date:** 2026-02-21

**Reason:** The commandExists function already handles errors gracefully (lines 44-56) and returns false when command not found, with an error message at line 49.

### JSON parse errors silently swallowed in OpenCode engine

**Location:** `cli/src/engines/opencode.ts:139`
**Date:** 2026-02-21

**Reason:** The catch block at lines 140-144 already logs a warning and writes the raw output to stdout. Errors are not silently swallowed.

### Inconsistent boolean parse behavior

**Location:** `cli/src/config/loader.ts:166-167`
**Date:** 2026-02-21

**Reason:** The parseBool function returns undefined for invalid values, and callers like applyConfigToConfig already check for undefined before assigning. This is consistent behavior.

### spawnSync error handling in bin.js could be clearer

**Location:** `cli/bin.js:88-90`
**Date:** 2026-02-21

**Reason:** The code already handles both result.error and result.status separately (lines 92-93). The `?? 1` fallback is appropriate for when status is null due to spawn failure.

## False Positives

<!-- Findings where the audit misread the code or described behavior that doesn't occur -->

### Dead reference to non-existent config.example

**Location:** `cli/src/config/loader:324` — warning message references config.example
**Date:** 2026-02-21

**Reason:** The file config.example DOES exist at /home/aural/Repos/springfield/config.example. The audit incorrectly stated it doesn't exist.

### Inconsistent COMMIT_STANDARD in base.ts

**Location:** `cli/src/engines/base.ts:23-49`
**Date:** 2026-02-21

**Reason:** The audit claimed conventional commits uses uppercase type (like "feat:", "fix:") but this is incorrect. Conventional commits specification uses lowercase types. The code correctly states "Lowercase type, imperative mood" which aligns with conventional commits. There is no inconsistency.

## Won't Fix

<!-- Real findings not worth fixing — architectural cost, external constraints, etc. -->

## Intentional Design Decisions

<!-- Findings that describe behavior which is correct by design -->
