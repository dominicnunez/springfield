# Code Audit Report

## Summary

This audit identified multiple issues across the codebase including error handling gaps, potential resource issues, configuration problems, and code quality concerns.

---

### [Error Handling] Unhandled file deletion errors in run.ts

- **Severity**: Medium
- **File**: cli/src/cli/commands/run.ts:266
- **Details**: `unlinkSync(options.prdPath)` can throw if file doesn't exist or permissions denied, crashing the program without graceful handling
- **Suggested fix**: Wrap in try-catch or use `rmSync` with error handling

---

### [Error Handling] Unhandled file deletion errors in run.ts (second occurrence)

- **Severity**: Medium
- **File**: cli/src/cli/commands/run.ts:492
- **Details**: Same issue as line 266 - unhandled `unlinkSync` can crash the program
- **Suggested fix**: Wrap in try-catch or use `rmSync` with error handling

---

### [Error Handling] Unhandled file write errors in logger.ts

- **Severity**: Medium
- **File**: cli/src/ui/logger.ts:32
- **Details**: `appendFileSync(logFilePath, line)` can throw on disk full, permissions, or directory not existing. No error handling around logging calls.
- **Suggested fix**: Wrap file writes in try-catch, log errors to stderr as fallback

---

### [Error Handling] Unhandled file write errors in logger.ts (logSessionStart)

- **Severity**: Medium
- **File**: cli/src/ui/logger.ts:101
- **Details**: `appendFileSync(logFilePath, header)` in `logSessionStart` has no error handling
- **Suggested fix**: Wrap in try-catch

---

### [Error Handling] Unhandled file append errors in progress.ts

- **Severity**: Medium
- **File**: cli/src/tasks/progress.ts:47
- **Details**: `appendFileSync(progressFile, entry)` can throw on disk full or permissions errors
- **Suggested fix**: Wrap in try-catch

---

### [Error Handling] Silent error swallowing in notify function

- **Severity**: Low
- **File**: cli/src/cli/commands/run.ts:84-95
- **Details**: The `notify` function uses empty catch block `} catch { // openclaw not available, ignore }` - errors other than "not available" are silently swallowed
- **Suggested fix**: Log unexpected errors at debug level

---

### [Error Handling] Silent error swallowing in audit.ts notify

- **Severity**: Low
- **File**: cli/src/cli/commands/audit.ts:74-86
- **Details**: Same pattern - empty catch block swallows all errors
- **Suggested fix**: Log unexpected errors at debug level

---

### [Security] Shell injection risk in test command execution

- **Severity**: High
- **File**: cli/src/tasks/verification.ts:167
- **Details**: `spawnSync(testCmd, [], { shell: true, ... })` executes test command via shell. While `testCmd` is typically from project config, if user provides malicious custom command via CLI, it could execute arbitrary code. Additionally, shell metacharacters in testCmd could be interpreted.
- **Suggested fix**: Use `shell: false` and pass args as array, or validate testCmd against allowlist of known-safe commands

---

### [Code Quality] Magic string for default OpenCode model

- **Severity**: Low
- **File**: cli/src/config/loader.ts:336
- **Details**: Default model "big-pickle" is hardcoded. This is a magic string that should be a named constant.
- **Suggested fix**: Create `DEFAULT_OC_PRIME_MODEL` constant at top of file

---

### [Bug] Invalid step validation exits without proper cleanup

- **Severity**: Low
- **File**: cli/src/cli/args.ts:131-135
- **Details**: When invalid `--step` value is provided, program calls `process.exit(1)` directly instead of going through normal cleanup. Also bypasses the centralized error handling in index.ts.
- **Suggested fix**: Either add the cleanup handlers here or throw an error that gets caught by the main try-catch

---

### [Bug] getHeadSha returns empty string on git failure

- **Severity**: Low
- **File**: cli/src/cli/commands/run.ts:135-140
- **Details**: If git rev-parse fails, `getHeadSha` returns empty string silently. The caller checks `!headBefore` but can't distinguish between "no commits yet" and "git error".
- **Suggested fix**: Return null/undefined on error, or throw, so callers can handle appropriately

---

### [Bug] parseBool accepts "0" as false but "0" typically means numeric zero

- **Severity**: Low
- **File**: cli/src/config/loader.ts:165-169
- **Details**: `parseBool` accepts "0" as false, which could cause confusion since "0" typically means "success" in Unix exit codes. Consider restricting to "true"/"false" only.
- **Suggested fix**: Remove "1" and "0" from valid values, only accept "true"/"false"

---

### [Configuration] Section header regex too restrictive

- **Severity**: Low
- **File**: cli/src/config/loader.ts:109
- **Details**: Regex `/^\[([a-z-]+)\]$/` only allows lowercase letters and hyphens in section headers. Uppercase or mixed-case section names like `[Ralph]` or `[Willie]` would not match.
- **Suggested fix**: Change to `/^\[([a-zA-Z-]+)\]$/`

---

### [Code Quality] Missing bounds check on parseInt results

- **Severity**: Low
- **File**: cli/src/config/loader.ts:202-204, 207-210, etc.
- **Details**: Multiple `parseInt()` calls without validating result is not NaN. Invalid config values silently become NaN.
- **Suggested fix**: Add validation after parseInt, fallback to default if NaN

---

### [Code Quality] Windows command detection incomplete

- **Severity**: Low
- **File**: cli/bin.js:44-52
- **Details**: `commandExists` uses `which` on non-Windows and `where` on Windows, but doesn't check for .cmd, .bat, or .exe extensions explicitly. `where` should handle this, but failure cases aren't clear.
- **Suggested fix**: Add explicit error message if command not found

---

### [Error Handling] JSON parse errors silently swallowed in OpenCode engine

- **Severity**: Low
- **File**: cli/src/engines/opencode.ts:139
- **Details**: `catch { ... }` block silently ignores JSON parse errors from OpenCode stream. Could hide important errors.
- **Suggested fix**: At minimum log at debug level, or collect errors for reporting

---

### [Code Quality] Inconsistent boolean parse behavior

- **Severity**: Low
- **File**: cli/src/config/loader.ts:166-167
- **Details**: `parseBool` returns `undefined` for invalid values but some callers use this to skip setting values while others might expect a default. Inconsistent handling could lead to unexpected behavior.
- **Suggested fix**: Add validation in applyConfigToConfig to warn on invalid boolean values

---

### [Bug] spawnSync error handling in bin.js could be clearer

- **Severity**: Low
- **File**: cli/bin.js:88-90
- **Details**: `if (result.error === undefined)` checks for no spawn error, then exits with status. However if spawn itself fails (not the command), `result.status` could be null. This is handled by `?? 1` fallback, but the logic is confusing.
- **Suggested fix**: Explicitly check `result.error` separately from exit code
