# Audit Exceptions

> Items validated as false positives or accepted as won't-fix.
> Managed by willie audit loop. Do not edit format manually.
>
> Entry format:
> ### Plain language description
> **Location:** `file/path:line` — optional context
> **Date:** YYYY-MM-DD
> **Reason:** Explanation (can be multiple lines)

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
