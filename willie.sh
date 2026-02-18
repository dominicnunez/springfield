#!/usr/bin/env bash
# willie.sh — Continuous audit → validate → fix loop
# Usage: ./willie.sh [start_step] [max_iterations]
#   start_step:     audit (default), validate, or fix — which step to start from
#   max_iterations: number of full loops (default: unlimited, 0 = unlimited)
#
# Examples:
#   ./willie.sh             # full loop from audit, unlimited
#   ./willie.sh 3           # full loop from audit, 3 iterations
#   ./willie.sh validate    # start from validate, then fix, then loop
#   ./willie.sh fix         # start from fix, then loop back to audit
#
# Requires: claude (Claude Code CLI), audit-prompt.md in project root

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPORT="$PROJECT_DIR/audit-report.md"
EXCEPTIONS="$PROJECT_DIR/known-exceptions.md"
LOG_DIR="$PROJECT_DIR/.audit-logs"
mkdir -p "$LOG_DIR"

# Parse arguments
START_STEP="audit"
MAX_ITER=0

for arg in "$@"; do
  case "$arg" in
    audit|validate|fix) START_STEP="$arg" ;;
    [0-9]*) MAX_ITER="$arg" ;;
  esac
done

ITER=0

# Read audit prompt from file
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

  claude --print --model opus --dangerously-skip-permissions -p "$prompt" > "$log_file" 2>&1
  local exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    log "WARNING: Claude exited with code $exit_code for step $step_name"
    log "Check log: $log_file"
    notify "⚠️ Willie CRASHED at iteration $ITER, step $step_name (exit code $exit_code). Check .audit-logs/iter${ITER}-${step_name}.log"
  fi

  return $exit_code
}

notify() {
  if command -v openclaw &>/dev/null; then
    openclaw cron wake "$1" 2>/dev/null || true
  fi
}

run_audit() {
  log "STEP 1: Running audit..."
  run_claude "audit" "$AUDIT_PROMPT" || true

  if [[ ! -f "$REPORT" ]]; then
    log "✅ No audit-report.md generated — codebase is clean!"
    notify "🎉 Willie: codebase clean after $ITER iteration(s). No findings."
    return 1  # signal to stop
  fi

  local finding_count
  finding_count=$(grep -c '### \[' "$REPORT" 2>/dev/null || echo "0")
  if [[ "$finding_count" -eq 0 ]]; then
    log "✅ Audit report has no findings. Cleaning up."
    rm -f "$REPORT"
    notify "🎉 Willie: codebase clean after $ITER iteration(s). No findings."
    return 1
  fi
  log "Audit found $finding_count issue(s)."
  return 0
}

run_validate() {
  log "STEP 2: Validating findings..."
  run_claude "validate" "$VALIDATE_PROMPT" || true

  if [[ ! -f "$REPORT" ]]; then
    log "All findings were false positives."
    return 0
  fi

  local remaining
  remaining=$(grep -c '### \[' "$REPORT" 2>/dev/null || echo "0")
  log "$remaining validated finding(s) remain."

  if [[ "$remaining" -eq 0 ]]; then
    rm -f "$REPORT"
    log "Report empty after validation."
  fi
  return 0
}

run_fix() {
  if [[ ! -f "$REPORT" ]]; then
    log "No audit report to fix. Skipping step 3."
    return 0
  fi

  log "STEP 3: Fixing issues..."
  run_claude "fix" "$FIX_PROMPT" || true

  if [[ ! -f "$REPORT" ]]; then
    log "All issues resolved."
  else
    local remaining
    remaining=$(grep -c '### \[' "$REPORT" 2>/dev/null || echo "0")
    if [[ "$remaining" -gt 0 ]]; then
      log "WARNING: $remaining finding(s) remain after fix step."
    fi
  fi
  return 0
}

log "=== Willie Starting ==="
log "Project: $PROJECT_DIR"
log "Start step: $START_STEP"
log "Max iterations: $([ "$MAX_ITER" -gt 0 ] && echo "$MAX_ITER" || echo "unlimited")"
log ""

# First iteration: start from specified step
FIRST_ITER=true

while true; do
  ITER=$((ITER + 1))

  if [[ "$MAX_ITER" -gt 0 && "$ITER" -gt "$MAX_ITER" ]]; then
    log "Reached max iterations ($MAX_ITER). Stopping."
    notify "Willie completed $MAX_ITER iteration(s)."
    break
  fi

  log "========== ITERATION $ITER =========="

  if [[ "$FIRST_ITER" == true ]]; then
    FIRST_ITER=false
    case "$START_STEP" in
      audit)
        run_audit || break
        run_validate
        run_fix
        ;;
      validate)
        run_validate
        run_fix
        ;;
      fix)
        run_fix
        ;;
    esac
  else
    run_audit || break
    run_validate
    run_fix
  fi

  log ""
done

log "=== Willie Complete ==="
log "Total iterations: $ITER"
log "Logs: $LOG_DIR/"
