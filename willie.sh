#!/usr/bin/env bash
# willie.sh — Continuous audit → validate → fix loop
# Usage: ./willie.sh [max_iterations]
#   max_iterations: number of loops (default: unlimited, 0 = unlimited)
#
# Requires: claude (Claude Code CLI)
# Each step runs in a fresh Claude Code session with --no-input (non-interactive).

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
MAX_ITER="${1:-0}"
ITER=0
REPORT="$PROJECT_DIR/audit-report.md"
EXCEPTIONS="$PROJECT_DIR/known-exceptions.md"
LOG_DIR="$PROJECT_DIR/.audit-logs"
mkdir -p "$LOG_DIR"

# Read audit prompt from file or inline
AUDIT_PROMPT_FILE="$PROJECT_DIR/audit-prompt.md"
if [[ ! -f "$AUDIT_PROMPT_FILE" ]]; then
  echo "ERROR: $AUDIT_PROMPT_FILE not found. Create it first."
  exit 1
fi
AUDIT_PROMPT="$(cat "$AUDIT_PROMPT_FILE")"

VALIDATE_PROMPT='Review and validate or invalidate each item in audit-report.md. Be thorough — actually read the code at every referenced file:line. Do not just trust the audit description.

Rules:
1. Read the actual code at the referenced file:line
2. Determine if the issue is real (valid) or a false positive (invalidate)
3. Move any false positives to known-exceptions.md with a "date added" field and brief reasoning
4. Remove invalidated items from audit-report.md
5. If ALL items are invalidated, delete audit-report.md entirely'

FIX_PROMPT='Fix the issues in audit-report.md. Do proper long-term fixes, not quick-fix bandaids. Do not leave the report behind — either fix everything or move remaining items to known-exceptions.md.

Rules:
1. Do proper long-term fixes, not quick-fix bandaids
2. Anything worth fixing later is valid and should be done now
3. Anything truly acceptable/wont-fix: add to known-exceptions.md with date added and reasoning
4. Semantically commit each fix with a descriptive message (push-after-commit is enabled)
5. Delete audit-report.md when 100% resolved and push'

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }

log() { echo "[$(timestamp)] $*"; }

run_claude() {
  local step_name="$1"
  local prompt="$2"
  local log_file="$LOG_DIR/iter${ITER}-${step_name}.log"

  log "Running step: $step_name (log: $log_file)"
  cd "$PROJECT_DIR"

  # Run Claude Code non-interactively (always Opus, skip permissions for automation)
  claude --print --verbose --model opus --dangerously-skip-permissions -p "$prompt" > "$log_file" 2>&1
  local exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    log "WARNING: Claude exited with code $exit_code for step $step_name"
    log "Check log: $log_file"
    notify "⚠️ Thor audit loop CRASHED at iteration $ITER, step $step_name (exit code $exit_code). Check .audit-logs/iter${ITER}-${step_name}.log"
  fi

  return $exit_code
}

notify() {
  # Notify Kai via openclaw cron wake
  if command -v openclaw &>/dev/null; then
    openclaw cron wake "$1" 2>/dev/null || true
  fi
}

log "=== Thor Audit Loop Starting ==="
log "Project: $PROJECT_DIR"
log "Max iterations: ${MAX_ITER:-unlimited}"
log ""

while true; do
  ITER=$((ITER + 1))

  if [[ "$MAX_ITER" -gt 0 && "$ITER" -gt "$MAX_ITER" ]]; then
    log "Reached max iterations ($MAX_ITER). Stopping."
    notify "Audit loop completed after $MAX_ITER iterations."
    break
  fi

  log "========== ITERATION $ITER =========="

  # Step 1: Audit
  log "STEP 1: Running audit..."
  run_claude "audit" "$AUDIT_PROMPT" || true

  # Check if audit produced findings
  if [[ ! -f "$REPORT" ]]; then
    log "✅ No audit-report.md generated — codebase is clean!"
    notify "🎉 Thor audit loop: codebase clean after $ITER iteration(s). No findings."
    break
  fi

  # Check if report is empty or has no findings
  finding_count=$(grep -c '### \[' "$REPORT" 2>/dev/null || echo "0")
  if [[ "$finding_count" -eq 0 ]]; then
    log "✅ Audit report has no findings. Cleaning up."
    rm -f "$REPORT"
    notify "🎉 Thor audit loop: codebase clean after $ITER iteration(s). No findings."
    break
  fi
  log "Audit found $finding_count issue(s)."

  # Step 2: Validate
  log "STEP 2: Validating findings..."
  run_claude "validate" "$VALIDATE_PROMPT" || true

  # Check if validation eliminated everything
  if [[ ! -f "$REPORT" ]]; then
    log "All findings were false positives. Running next audit to confirm..."
    continue
  fi

  remaining=$(grep -c '### \[' "$REPORT" 2>/dev/null || echo "0")
  log "$remaining validated finding(s) remain."

  if [[ "$remaining" -eq 0 ]]; then
    rm -f "$REPORT"
    log "Report empty after validation. Running next audit to confirm..."
    continue
  fi

  # Step 3: Fix
  log "STEP 3: Fixing issues..."
  run_claude "fix" "$FIX_PROMPT" || true

  # Check if fix step resolved everything
  if [[ ! -f "$REPORT" ]]; then
    log "All issues resolved. Running next audit to verify..."
  else
    remaining=$(grep -c '### \[' "$REPORT" 2>/dev/null || echo "0")
    log "WARNING: $remaining finding(s) remain after fix step."
    if [[ "$remaining" -gt 0 ]]; then
      log "Some issues may need manual attention. Continuing to next iteration..."
    fi
  fi

  log ""
done

log "=== Audit Loop Complete ==="
log "Total iterations: $ITER"
log "Logs: $LOG_DIR/"
