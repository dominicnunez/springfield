#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────
# Ralph - Unified AI Coding Agent Runner
# Supports both Claude Code and OpenCode engines
# ─────────────────────────────────────────────────────────────

# Get project name from current directory
PROJECT_NAME=$(basename "$(pwd)")

# Config file locations (in priority order)
PROJECT_CONFIG=".ralph/ralph.env"
GLOBAL_CONFIG="$HOME/.config/ralph/ralph.env"

# Log directory and file (external to project)
LOG_DIR="${RALPH_LOG_DIR:-$HOME/.ralph/logs}"
LOG_FILE="$LOG_DIR/ralph-${PROJECT_NAME}.log"

# Progress file location (centralized per-project)
PROGRESS_DIR="$HOME/.ralph/progress"
PROGRESS_FILE="$PROGRESS_DIR/progress-${PROJECT_NAME}.log"

# State directory for resume capability (per-project)
STATE_DIR="$HOME/.ralph/state/${PROJECT_NAME}"

# ─────────────────────────────────────────────────────────────
# PRESERVE ENVIRONMENT OVERRIDES BEFORE SOURCING CONFIG
# ─────────────────────────────────────────────────────────────

ENV_ENGINE=${ENGINE-}
ENV_MAX_ITERATIONS=${MAX_ITERATIONS-}
ENV_SLEEP_SECONDS=${SLEEP_SECONDS-}
ENV_SKIP_COMMIT=${SKIP_COMMIT-}
ENV_PUSH_AFTER_COMMIT=${PUSH_AFTER_COMMIT-}
# Claude settings
ENV_CLAUDE_MODEL=${CLAUDE_MODEL-}

# OpenCode settings
ENV_OC_PRIME_MODEL=${OC_PRIME_MODEL-}
ENV_OC_FALL_MODEL=${OC_FALL_MODEL-}

# Test settings
ENV_TEST_CMD=${TEST_CMD-}
ENV_SKIP_TEST_VERIFY=${SKIP_TEST_VERIFY-}

# Rate limit settings
ENV_SOFT_LIMIT_RETRIES=${SOFT_LIMIT_RETRIES-}
ENV_SOFT_LIMIT_WAIT=${SOFT_LIMIT_WAIT-}

# ─────────────────────────────────────────────────────────────
# DEFAULT CONFIG (for self-healing if global config missing)
# ─────────────────────────────────────────────────────────────

DEFAULT_CONFIG_CONTENT='# Ralph Global Configuration
# Created by ralph.sh (self-healing)
#
# Override per-project: .ralph/ralph.env
# Docs: https://github.com/dominicnunez/ralph

# ─────────────────────────────────────────────────────────────
# Engine Selection
# ─────────────────────────────────────────────────────────────

# AI engine: "opencode" or "claude"
ENGINE=opencode

# ─────────────────────────────────────────────────────────────
# Model Settings
# ─────────────────────────────────────────────────────────────

# OpenCode primary model (big-pickle is free tier)
OC_PRIME_MODEL=big-pickle

# Claude model (sonnet balances cost/capability)
# Options: opus, sonnet, haiku
CLAUDE_MODEL=sonnet

# OpenCode fallback model when primary hits rate limits (optional)
# OC_FALL_MODEL=

# ─────────────────────────────────────────────────────────────
# Iteration Settings
# ─────────────────────────────────────────────────────────────

# Maximum iterations (-1 = infinite, run until all tasks complete)
MAX_ITERATIONS=10

# Seconds to pause between iterations
SLEEP_SECONDS=2

# ─────────────────────────────────────────────────────────────
# Behavior Settings
# ─────────────────────────────────────────────────────────────

# Skip git commits (1 = dont commit, useful for testing)
SKIP_COMMIT=0

# Push after successful commit (1 = push to origin after each commit)
PUSH_AFTER_COMMIT=0

# Skip test verification (1 = dont check for tests, not recommended)
SKIP_TEST_VERIFY=0

# ─────────────────────────────────────────────────────────────
# Test Settings
# ─────────────────────────────────────────────────────────────

# Test command - how Ralph runs your tests after each task
# Auto-detected from: package.json, vitest, jest, pytest, go, cargo
# Set manually if auto-detection fails or you need a custom command
# Examples: "npm run test:ci", "pytest -x", "go test ./... -v"
# TEST_CMD=

# ─────────────────────────────────────────────────────────────
# Rate Limit Settings (OpenCode only)
# ─────────────────────────────────────────────────────────────

# Number of retries for soft rate limits (per-minute cooldowns)
# before switching to fallback model
SOFT_LIMIT_RETRIES=3

# Base wait time in seconds for soft rate limit backoff
# Actual wait: base * 2^attempt (30s, 60s, 120s)
SOFT_LIMIT_WAIT=30

# ─────────────────────────────────────────────────────────────
# Logging Settings
# ─────────────────────────────────────────────────────────────

# Log directory for Ralph session logs
# Default: ~/.ralph/logs
# Logs are named: ralph-<projectname>.log
# RALPH_LOG_DIR=
'

# ─────────────────────────────────────────────────────────────
# ENSURE GLOBAL CONFIG EXISTS (self-healing)
# ─────────────────────────────────────────────────────────────

if [[ ! -f "$GLOBAL_CONFIG" ]]; then
    mkdir -p "$(dirname "$GLOBAL_CONFIG")"
    echo "$DEFAULT_CONFIG_CONTENT" > "$GLOBAL_CONFIG"
fi

# ─────────────────────────────────────────────────────────────
# LOAD CONFIG FILES (global first, then project overrides)
# ─────────────────────────────────────────────────────────────

# Load global config
source "$GLOBAL_CONFIG"

# Load project config if exists (overrides global)
if [[ -f "$PROJECT_CONFIG" ]]; then
    source "$PROJECT_CONFIG"
fi

# ─────────────────────────────────────────────────────────────
# RESTORE ENVIRONMENT OVERRIDES (env vars take precedence)
# ─────────────────────────────────────────────────────────────

[[ -n "$ENV_ENGINE" ]] && ENGINE="$ENV_ENGINE"
[[ -n "$ENV_MAX_ITERATIONS" ]] && MAX_ITERATIONS="$ENV_MAX_ITERATIONS"
[[ -n "$ENV_SLEEP_SECONDS" ]] && SLEEP_SECONDS="$ENV_SLEEP_SECONDS"
[[ -n "$ENV_SKIP_COMMIT" ]] && SKIP_COMMIT="$ENV_SKIP_COMMIT"
[[ -n "$ENV_PUSH_AFTER_COMMIT" ]] && PUSH_AFTER_COMMIT="$ENV_PUSH_AFTER_COMMIT"
[[ -n "$ENV_CLAUDE_MODEL" ]] && CLAUDE_MODEL="$ENV_CLAUDE_MODEL"
[[ -n "$ENV_OC_PRIME_MODEL" ]] && OC_PRIME_MODEL="$ENV_OC_PRIME_MODEL"
[[ -n "$ENV_OC_FALL_MODEL" ]] && OC_FALL_MODEL="$ENV_OC_FALL_MODEL"
[[ -n "$ENV_TEST_CMD" ]] && TEST_CMD="$ENV_TEST_CMD"
[[ -n "$ENV_SKIP_TEST_VERIFY" ]] && SKIP_TEST_VERIFY="$ENV_SKIP_TEST_VERIFY"
[[ -n "$ENV_SOFT_LIMIT_RETRIES" ]] && SOFT_LIMIT_RETRIES="$ENV_SOFT_LIMIT_RETRIES"
[[ -n "$ENV_SOFT_LIMIT_WAIT" ]] && SOFT_LIMIT_WAIT="$ENV_SOFT_LIMIT_WAIT"

# ─────────────────────────────────────────────────────────────
# APPLY SETTINGS (config values already loaded, just set aliases)
# ─────────────────────────────────────────────────────────────

MAX=${MAX_ITERATIONS:--1}
SLEEP=${SLEEP_SECONDS:-2}

# Track which model is currently active (for OpenCode fallback)
CURRENT_OC_PRIME_MODEL="$OC_PRIME_MODEL"
USING_FALLBACK=0

COMPLETE_MARKER="<promise>COMPLETE</promise>"

# ─────────────────────────────────────────────────────────────
# VALIDATE ENGINE
# ─────────────────────────────────────────────────────────────

case "$ENGINE" in
    claude|opencode)
        ;;
    *)
        echo "Error: Invalid ENGINE '$ENGINE'. Must be 'claude' or 'opencode'." >&2
        exit 1
        ;;
esac

# Check if the selected engine's CLI is available
if [[ "$ENGINE" == "claude" ]]; then
    if ! command -v claude &>/dev/null; then
        echo "Error: 'claude' command not found. Please install Claude CLI." >&2
        exit 1
    fi
elif [[ "$ENGINE" == "opencode" ]]; then
    if ! command -v opencode &>/dev/null; then
        echo "Error: 'opencode' command not found. Please install OpenCode CLI." >&2
        exit 1
    fi
fi

# Check if PRD.md exists in the current directory
if [[ ! -f "PRD.md" ]]; then
    echo "Error: PRD.md not found in $(pwd)" >&2
    echo "Create a PRD.md file with your project requirements before running Ralph." >&2
    exit 1
fi

# ─────────────────────────────────────────────────────────────
# OPENCODE AUTO-CONFIGURATION
# ─────────────────────────────────────────────────────────────

setup_opencode_permissions() {
    local config_dir="$HOME/.config/opencode"
    local config_file="$config_dir/opencode.json"
    
    # Only needed for opencode engine
    [[ "$ENGINE" != "opencode" ]] && return 0
    
    # Create config dir if needed
    mkdir -p "$config_dir"
    
    # If config doesn't exist, create minimal one with ralph permissions
    if [[ ! -f "$config_file" ]]; then
        cat > "$config_file" << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "external_directory": {
      "~/.ralph/**": "allow"
    }
  }
}
EOF
        echo "✓ Created OpenCode config with Ralph permissions"
        return 0
    fi
    
    # Config exists - check if ralph permission is already there
    if grep -q '\.ralph' "$config_file" 2>/dev/null; then
        return 0  # Already configured
    fi
    
    # Need to add permission to existing config
    # Use jq if available, otherwise warn user
    if command -v jq &>/dev/null; then
        local tmp=$(mktemp)
        jq '.permission.external_directory["~/.ralph/**"] = "allow"' "$config_file" > "$tmp" && mv "$tmp" "$config_file"
        echo "✓ Added Ralph permissions to OpenCode config"
    else
        echo "⚠️  Please add this to $config_file manually:"
        echo '  "permission": { "external_directory": { "~/.ralph/**": "allow" } }'
    fi
}

# Run OpenCode setup
setup_opencode_permissions

# ─────────────────────────────────────────────────────────────
# LOGGING FUNCTIONS
# ─────────────────────────────────────────────────────────────

setup_logging() {
    mkdir -p "$LOG_DIR"
    mkdir -p "$PROGRESS_DIR"
    mkdir -p "$STATE_DIR"
    echo "" >> "$LOG_FILE"
    echo "═══════════════════════════════════════════════════════════════" >> "$LOG_FILE"
    echo "  Ralph Session Started: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
    echo "  Project: $PROJECT_NAME" >> "$LOG_FILE"
    echo "  Engine: $ENGINE" >> "$LOG_FILE"
    if [[ "$ENGINE" == "claude" ]]; then
        echo "  Model: $CLAUDE_MODEL" >> "$LOG_FILE"
    else
        echo "  Model: $OC_PRIME_MODEL" >> "$LOG_FILE"
    fi
    echo "═══════════════════════════════════════════════════════════════" >> "$LOG_FILE"
}

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    
    # Also print to stdout for certain levels
    case "$level" in
        ERROR|WARN)
            echo "[$level] $message"
            ;;
    esac
}

log_iteration() {
    local iteration="$1"
    local task="$2"
    echo "" >> "$LOG_FILE"
    echo "───────────────────────────────────────────────────────────────" >> "$LOG_FILE"
    echo "  Iteration $iteration - $(date '+%H:%M:%S')" >> "$LOG_FILE"
    echo "  Task: $task" >> "$LOG_FILE"
    echo "───────────────────────────────────────────────────────────────" >> "$LOG_FILE"
}

log_resources() {
    # Get memory usage
    if command -v free &> /dev/null; then
        local mem_info=$(free -m | awk 'NR==2 {printf "Memory %dMB/%dMB", $3, $2}')
    else
        local mem_info="Memory info unavailable"
    fi

    # Get system load average
    if [[ -f /proc/loadavg ]]; then
        local load_avg=$(cat /proc/loadavg | awk '{print $1}')
        local load_info="Load: $load_avg"
    else
        local load_info="Load info unavailable"
    fi

    log "INFO" "Resources: $mem_info, $load_info"
}

# ─────────────────────────────────────────────────────────────
# SIGNAL HANDLING FOR GRACEFUL SHUTDOWN
# ─────────────────────────────────────────────────────────────

handle_signal() {
    local signal_name="$1"
    log "WARN" "Received signal: $signal_name"

    # Log current iteration and task if available
    if [[ -n "${i:-}" ]]; then
        log "WARN" "Current iteration: $i"
    fi
    if [[ -n "${current_task:-}" ]]; then
        log "WARN" "Current task: $current_task"
    fi

    # State files are saved at iteration start
    # Point to state directory for resume information
    log "INFO" "State saved in: $STATE_DIR"

    # Exit gracefully
    exit 130
}

# Set up signal traps
trap 'handle_signal SIGTERM' TERM
trap 'handle_signal SIGINT' INT
trap 'handle_signal SIGHUP' HUP

# ─────────────────────────────────────────────────────────────
# TEST COMMAND DETECTION
# ─────────────────────────────────────────────────────────────

detect_test_cmd() {
    # If explicitly configured, use that
    if [[ -n "$TEST_CMD" ]]; then
        echo "$TEST_CMD"
        return
    fi
    
    # Auto-detect based on project files
    if [[ -f "package.json" ]]; then
        if grep -q '"test"' package.json 2>/dev/null; then
            if [[ -f "bun.lockb" ]]; then
                echo "bun test"
            elif [[ -f "pnpm-lock.yaml" ]]; then
                echo "pnpm test"
            elif [[ -f "yarn.lock" ]]; then
                echo "yarn test"
            else
                echo "npm test"
            fi
            return
        fi
    fi
    
    # Check for common test runners directly
    if [[ -f "vitest.config.ts" ]] || [[ -f "vitest.config.js" ]]; then
        echo "npx vitest run"
        return
    fi
    
    if [[ -f "jest.config.ts" ]] || [[ -f "jest.config.js" ]]; then
        echo "npx jest"
        return
    fi
    
    # Python
    if [[ -f "pytest.ini" ]] || [[ -f "pyproject.toml" ]]; then
        echo "pytest"
        return
    fi
    
    # Go
    if [[ -f "go.mod" ]]; then
        echo "go test ./..."
        return
    fi
    
    # Rust
    if [[ -f "Cargo.toml" ]]; then
        echo "cargo test"
        return
    fi
    
    echo ""
}

# ─────────────────────────────────────────────────────────────
# TEST VERIFICATION
# ─────────────────────────────────────────────────────────────

verify_tests_written() {
    # Get the last commit (or staged changes if no commits yet)
    local test_changes=""
    
    # Test file patterns by language:
    # - JS/TS: *.test.ts, *.spec.js, etc.
    # - Python: *_test.py, test_*.py
    # - Go: *_test.go
    local test_pattern='\.(test|spec)\.(ts|js|tsx|jsx|py)$|_test\.(go|py)$|^test_.*\.py$'
    
    # Check for test files in staged/unstaged changes
    test_changes=$(git diff --name-only HEAD 2>/dev/null | grep -E "$test_pattern" || true)
    
    # Also check staged files
    local staged_tests=$(git diff --cached --name-only 2>/dev/null | grep -E "$test_pattern" || true)
    
    # Combine
    if [[ -n "$staged_tests" ]]; then
        test_changes="$test_changes"$'\n'"$staged_tests"
    fi
    
    # Also check for test files in recent commits (in case AI committed)
    local recent_test_commits=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -E "$test_pattern" || true)
    if [[ -n "$recent_test_commits" ]]; then
        test_changes="$test_changes"$'\n'"$recent_test_commits"
    fi
    
    # Remove empty lines and duplicates
    test_changes=$(echo "$test_changes" | grep -v '^$' | sort -u)
    
    if [[ -z "$test_changes" ]]; then
        log "WARN" "No test files were created or modified"
        echo "❌ No test files were created or modified this iteration"
        return 1
    fi
    
    log "INFO" "Test files changed: $(echo "$test_changes" | tr '\n' ', ')"
    echo "✅ Test files changed:"
    echo "$test_changes" | sed 's/^/   /'
    return 0
}

# ─────────────────────────────────────────────────────────────
# DIFFERENTIAL TEST VERIFICATION
# ─────────────────────────────────────────────────────────────

run_tests() {
    local test_cmd="$1"
    
    if [[ -z "$test_cmd" ]]; then
        log "WARN" "No test command detected, skipping verification"
        echo "⚠️  No test command detected, skipping verification"
        last_test_output=""
        return 0
    fi
    
    echo ""
    echo "🧪 Running test verification: $test_cmd"
    echo "-------------------------------------------"
    log "INFO" "Running tests: $test_cmd"
    
    set +e
    local test_output
    test_output=$(eval "$test_cmd" 2>&1)
    local exit_code=$?
    set -e
    
    echo "$test_output"
    echo "-------------------------------------------"

    # Store test output globally for use in fix prompt
    last_test_output="$test_output"

    # Log test output (truncated)
    echo "$test_output" | tail -20 >> "$LOG_FILE"

    if [[ $exit_code -eq 0 ]]; then
        log "INFO" "Tests passed"
        echo "✅ Tests passed!"
        return 0
    else
        log "ERROR" "Tests failed (exit code: $exit_code)"
        echo "❌ Tests failed (exit code: $exit_code)"
        return 1
    fi
}

get_current_task() {
    # Extract the first incomplete task from PRD.md
    if [[ -f "PRD.md" ]]; then
        grep -m1 -E '^\s*-\s*\[ \]' PRD.md 2>/dev/null | sed 's/^\s*-\s*\[ \]\s*//' || echo "unknown"
    else
        echo "unknown"
    fi
}

# ─────────────────────────────────────────────────────────────
# RATE LIMIT HANDLING (OpenCode only)
# ─────────────────────────────────────────────────────────────

# Hard rate limits: quota exhausted, billing issues - won't recover with waiting
is_hard_rate_limit() {
    local output="$1"
    echo "$output" | grep -qiE 'insufficient_quota|insufficient.balance|exceeded.*(usage.tier|current.quota)|billing.details|not.?included.?in.?(your|plan)'
}

# Soft rate limits: temporary cooldowns - may recover after waiting
is_soft_rate_limit() {
    local output="$1"
    # Must have rate limit indicator but NOT hard limit indicators
    if is_hard_rate_limit "$output"; then
        return 1
    fi
    echo "$output" | grep -qiE 'rate.?limit|statusCode.*429|too.?many.?request|per.?minute|tokens.per.minute|over.?capacity|(^|[^a-z])at.?capacity|retry.?after'
}

# Any rate limit (soft or hard)
is_rate_limited() {
    local output="$1"
    is_hard_rate_limit "$output" || is_soft_rate_limit "$output"
}

switch_to_fallback() {
    if [[ -n "$OC_FALL_MODEL" && "$USING_FALLBACK" -eq 0 ]]; then
        echo ""
        echo "==========================================="
        echo "  Rate limit detected on $CURRENT_OC_PRIME_MODEL"
        echo "  Switching to fallback: $OC_FALL_MODEL"
        echo "==========================================="
        echo ""
        log "WARN" "Rate limit on $CURRENT_OC_PRIME_MODEL, switching to $OC_FALL_MODEL"
        CURRENT_OC_PRIME_MODEL="$OC_FALL_MODEL"
        USING_FALLBACK=1
        return 0
    fi
    return 1
}

# Retry with backoff for soft rate limits
# Returns 0 if retry succeeded, 1 if should give up
handle_soft_rate_limit() {
    local attempt="$1"
    local max_retries="${SOFT_LIMIT_RETRIES:-3}"
    local base_wait="${SOFT_LIMIT_WAIT:-30}"
    
    if [[ "$attempt" -ge "$max_retries" ]]; then
        log "WARN" "Soft rate limit: exhausted $max_retries retries"
        echo "⚠️  Soft rate limit persisted after $max_retries retries"
        return 1
    fi
    
    # Exponential backoff: 30s, 60s, 120s
    local wait_time=$((base_wait * (2 ** attempt)))
    
    echo ""
    echo "───────────────────────────────────────────────────────────────"
    echo "  ⏳ Soft rate limit detected (attempt $((attempt + 1))/$max_retries)"
    echo "  Waiting ${wait_time}s before retry..."
    echo "───────────────────────────────────────────────────────────────"
    log "INFO" "Soft rate limit: waiting ${wait_time}s (attempt $((attempt + 1))/$max_retries)"
    
    sleep "$wait_time"
    return 0
}

# ─────────────────────────────────────────────────────────────
# PROMPT
# ─────────────────────────────────────────────────────────────

if [[ "$SKIP_COMMIT" == "1" ]]; then
    COMMIT_INSTRUCTIONS=$(cat <<EOF
- If tests PASS:
  - Update PRD.md to mark the task complete (change [ ] to [x])
  - Do NOT commit any changes in this run
  - Append what worked to $PROGRESS_FILE
EOF
)
else
    COMMIT_INSTRUCTIONS=$(cat <<EOF
- If tests PASS:
  - Update PRD.md to mark the task complete (change [ ] to [x])
  - Commit your changes with message: feat: [task description] (do NOT add Co-Authored-By)
  - Append what worked to $PROGRESS_FILE
EOF
)
fi

PROMPT=$(cat <<EOF
You are Ralph, an autonomous coding agent. Do exactly ONE task per iteration.

## Steps

1. Read PRD.md and find the first task that is NOT complete (marked [ ]).
2. Read $PROGRESS_FILE - check the Learnings section first for patterns from previous iterations.
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

## Test Quality Rules

Write tests that verify **behavior**, not implementation details:
- **DO:** Test inputs → outputs, side effects, error handling, edge cases
- **DON'T:** Test that a file exists, that a function is imported, that a component renders at all
- **DON'T:** Write structural/reflection tests (e.g., checking method names exist via reflect)
- **DON'T:** Create mocks that just return nil for everything — mocks should simulate real behavior
- **DON'T:** Add random suffixes to test names (US1, US2, _US3, TestUS4)
- **DO:** Use clear, descriptive test names: TestCalculateScore, TestCreateAppointment_DuplicateDate
- **DO:** Assert on actual values, not just "no error returned"
- **DO:** Test the interesting cases — conflicts, duplicates, empty inputs, boundaries
- Keep test count proportional to complexity — don't write 20 tests for a simple CRUD function

## Only Complete If Tests Pass

$COMMIT_INSTRUCTIONS

- If tests FAIL:
  - Do NOT mark the task complete
  - Do NOT commit broken code
  - Append what went wrong to $PROGRESS_FILE (so next iteration can learn)

## Progress Notes Format

Append to $PROGRESS_FILE using this format:

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
- If ALL tasks are [x], output exactly: $COMPLETE_MARKER
- If tasks remain [ ], just end your response (next iteration will continue)
EOF
)

# ─────────────────────────────────────────────────────────────
# FIX TESTS PROMPT (used when previous iteration had test failures)
# ─────────────────────────────────────────────────────────────

# This will be built dynamically with the actual test output
build_fix_tests_prompt() {
    local test_output="$1"
    local truncated_output
    
    # Truncate test output to last 100 lines to avoid overwhelming the AI
    truncated_output=$(echo "$test_output" | tail -100)
    
    cat <<EOF
You are Ralph, an autonomous coding agent. Your ONLY task is to FIX THE FAILING TESTS.

## PRIORITY: FIX FAILING TESTS

The previous iteration failed because tests did not pass. You MUST fix the failing tests before doing anything else.

## Test Failure Output

\`\`\`
$truncated_output
\`\`\`

## Steps

1. Read the test failure output above carefully.
2. Read $PROGRESS_FILE - check what was attempted and what failed.
3. Identify WHY the tests are failing (look at the error messages).
4. Fix the code or tests to make ALL tests pass.
5. Run the full test suite to verify ALL tests pass.

## Rules

- Do NOT implement new features
- Do NOT mark any tasks complete until tests pass
- Do NOT commit any code until tests pass
- Focus ONLY on making the existing tests pass

## After Fixing

$COMMIT_INSTRUCTIONS

- Append what you fixed to $PROGRESS_FILE with format:

## Fix Attempt - Iteration [N]
- Error identified: [what was wrong]
- Fix applied: [what you changed]
- Test results: PASS/FAIL
---

## End Condition

After fixing and tests pass, check PRD.md:
- If ALL tasks are [x], output exactly: $COMPLETE_MARKER
- If tasks remain [ ], just end your response (next iteration will continue)
EOF
}

# Function to get the appropriate prompt based on test failure mode
get_current_prompt() {
    if [[ "$test_failure_mode" -eq 1 ]] && [[ -n "$last_test_output" ]]; then
        build_fix_tests_prompt "$last_test_output"
    else
        echo "$PROMPT"
    fi
}

# ─────────────────────────────────────────────────────────────
# RUN ENGINE
# ─────────────────────────────────────────────────────────────

run_claude() {
    local prompt="$1"
    # Wrap in script for PTY - makes Claude stream output like OpenCode
    script -q /dev/null -c "claude --model \"$CLAUDE_MODEL\" --dangerously-skip-permissions -p \"$prompt\""
}

run_opencode() {
    local prompt="$1"
    # OpenCode requires a PTY to function - script provides a pseudo-TTY wrapper
    # Without this, opencode hangs indefinitely in non-interactive environments
    # (cron, background processes, piped output)
    script -q /dev/null -c "opencode run --model \"$CURRENT_OC_PRIME_MODEL\" \"$prompt\""
}

run_engine() {
    local prompt="$1"
    if [[ "$ENGINE" == "claude" ]]; then
        run_claude "$prompt"
    else
        run_opencode "$prompt"
    fi
}

# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

# Setup logging
setup_logging

# Detect test command at startup
DETECTED_TEST_CMD=$(detect_test_cmd)

# Print startup info
if [[ "$MAX" -eq -1 ]]; then
    echo "Starting Ralph ($ENGINE) - Infinite mode (until complete)"
else
    echo "Starting Ralph ($ENGINE) - Max $MAX iterations"
fi

if [[ "$ENGINE" == "claude" ]]; then
    echo "Using model: $CLAUDE_MODEL"
else
    echo "Using model: $OC_PRIME_MODEL"
    [[ -n "$OC_FALL_MODEL" ]] && echo "Fallback model: $OC_FALL_MODEL"
fi

[[ "$SKIP_COMMIT" == "1" ]] && echo "Commits disabled for this run"
[[ "$PUSH_AFTER_COMMIT" == "1" ]] && echo "📤 Push after commit: enabled"

if [[ "$SKIP_TEST_VERIFY" == "1" ]]; then
    echo "⚠️  Test verification DISABLED"
    log "WARN" "Test verification disabled"
elif [[ -n "$DETECTED_TEST_CMD" ]]; then
    echo "🧪 Test command: $DETECTED_TEST_CMD"
    log "INFO" "Test command: $DETECTED_TEST_CMD"
else
    echo "⚠️  No test command detected (configure TEST_CMD in ralph.env)"
    log "WARN" "No test command detected"
fi

echo "📝 Log file: $LOG_FILE"
echo ""

i=0
soft_limit_retries=0
test_failure_mode=0
last_test_output=""

while [[ "$MAX" -eq -1 ]] || [[ "$i" -lt "$MAX" ]]; do
    ((++i))
    
    # Record HEAD before iteration (for push detection)
    head_before=$(git rev-parse HEAD 2>/dev/null || echo "")
    
    current_task=$(get_current_task)

    # Save iteration state for resume capability
    echo "$i" > "$STATE_DIR/last_iteration"
    echo "$current_task" > "$STATE_DIR/last_task"

    log_iteration "$i" "$current_task"
    log_resources

    # Record iteration start time for duration tracking
    iteration_start_time=$(date +%s)

    # Build display model name
    if [[ "$ENGINE" == "claude" ]]; then
        display_model="$CLAUDE_MODEL"
    else
        display_model="$CURRENT_OC_PRIME_MODEL"
    fi
    
    if [[ "$MAX" -eq -1 ]]; then
        echo "==========================================="
        echo "  Iteration $i (infinite mode) - $display_model"
        echo "  Task: $current_task"
        [[ "$test_failure_mode" -eq 1 ]] && echo "  Mode: 🔧 FIX TESTS"
        echo "==========================================="
    else
        echo "==========================================="
        echo "  Iteration $i of $MAX - $display_model"
        echo "  Task: $current_task"
        [[ "$test_failure_mode" -eq 1 ]] && echo "  Mode: 🔧 FIX TESTS"
        echo "==========================================="
    fi

    # Get the appropriate prompt (normal or fix-tests)
    current_prompt=$(get_current_prompt)
    
    # Run AI agent
    set +e
    tmpfile=$(mktemp)
    run_engine "$current_prompt" 2>&1 | tee "$tmpfile"
    exit_code=${PIPESTATUS[0]}
    result=$(cat "$tmpfile")
    rm -f "$tmpfile"
    set -e
    
    # Circuit breaker: bail immediately on auth failures (expired OAuth token, etc.)
    if echo "$result" | grep -qi "authentication_error\|Failed to authenticate\|OAuth token has expired\|401.*auth"; then
        log "ERROR" "Authentication failure detected — aborting. Re-auth with: claude login"
        echo "🔒 Auth failure — ralph.sh exiting to prevent infinite retry loop."
        echo "   Fix: run 'claude login' to refresh OAuth token, then re-run ralph."
        exit 1
    fi

    # Log AI output (truncated)
    echo "$result" | head -50 >> "$LOG_FILE"
    echo "[... truncated ...]" >> "$LOG_FILE"

    # ─────────────────────────────────────────────────────────
    # RATE LIMIT HANDLING (OpenCode only)
    # Strategy: hard limits → immediate fallback
    #           soft limits → retry with backoff, then fallback
    # ─────────────────────────────────────────────────────────
    
    if [[ "$ENGINE" == "opencode" ]]; then
        rate_limit_handled=0
        
        # Check for hard rate limit (quota exhausted) - immediate fallback
        if is_hard_rate_limit "$result"; then
            log "WARN" "Hard rate limit detected (quota/billing)"
            echo "🚫 Hard rate limit: quota or billing issue"
            soft_limit_retries=0  # Reset soft counter
            if switch_to_fallback; then
                ((--i))
                rate_limit_handled=1
            else
                log "ERROR" "Hard rate limit and no fallback available"
                echo "❌ Hard rate limit and no fallback available"
                exit 1
            fi
        # Check for soft rate limit (temporary cooldown) - retry first
        elif is_soft_rate_limit "$result"; then
            log "WARN" "Soft rate limit detected (temporary cooldown)"
            if handle_soft_rate_limit "$soft_limit_retries"; then
                ((soft_limit_retries++))
                ((--i))  # Retry same iteration
                rate_limit_handled=1
            else
                # Retries exhausted, try fallback
                soft_limit_retries=0
                if switch_to_fallback; then
                    ((--i))
                    rate_limit_handled=1
                else
                    log "ERROR" "Soft rate limit persisted, no fallback available"
                    echo "❌ Rate limit persisted after retries, no fallback available"
                    exit 1
                fi
            fi
        fi
        
        if [[ "$rate_limit_handled" -eq 1 ]]; then
            continue
        fi
        
        # Reset soft limit counter on successful iteration
        soft_limit_retries=0
    fi

    # Handle non-rate-limit errors
    if [[ $exit_code -ne 0 ]]; then
        log "ERROR" "Claude Code exited with code $exit_code"
        echo "Error from $ENGINE (exit code $exit_code)"

        # Log last 500 characters of output for debugging
        last_output=$(echo "$result" | tail -c 500)
        log "ERROR" "Last 500 chars of output: $last_output"

        exit $exit_code
    fi

    echo ""

    # ─────────────────────────────────────────────────────────
    # TEST VERIFICATION GATE
    # ─────────────────────────────────────────────────────────
    
    if [[ "$SKIP_TEST_VERIFY" != "1" ]]; then
        verification_failed=0
        
        # Step 1: Verify tests were written
        if [[ -n "$DETECTED_TEST_CMD" ]]; then
            echo ""
            echo "📋 Checking if tests were written..."
            if ! verify_tests_written; then
                log "WARN" "No tests written, iteration failed"
                verification_failed=1
                
                # Append to progress file so AI knows
                echo "" >> "$PROGRESS_FILE"
                echo "## FAILED - Iteration $i" >> "$PROGRESS_FILE"
                echo "- Reason: No test files were created or modified" >> "$PROGRESS_FILE"
                echo "- You MUST write tests before the task can be completed" >> "$PROGRESS_FILE"
                echo "---" >> "$PROGRESS_FILE"
            fi
        fi
        
        # Step 2: Run tests (only if tests were written or we're checking anyway)
        if [[ $verification_failed -eq 0 ]] && [[ -n "$DETECTED_TEST_CMD" ]]; then
            if ! run_tests "$DETECTED_TEST_CMD"; then
                log "WARN" "Tests failed, iteration failed"
                verification_failed=1
                
                # Set test failure mode so next iteration uses fix prompt
                test_failure_mode=1
                
                # Truncate test output for progress file (last 50 lines)
                truncated_test_output=$(echo "$last_test_output" | tail -50)
                
                # Append to progress file with actual test output
                echo "" >> "$PROGRESS_FILE"
                echo "## FAILED - Iteration $i" >> "$PROGRESS_FILE"
                echo "- Reason: Tests failed" >> "$PROGRESS_FILE"
                echo "- Fix the failing tests before marking the task complete" >> "$PROGRESS_FILE"
                echo "" >> "$PROGRESS_FILE"
                echo "### Test Output (last 50 lines):" >> "$PROGRESS_FILE"
                echo "\`\`\`" >> "$PROGRESS_FILE"
                echo "$truncated_test_output" >> "$PROGRESS_FILE"
                echo "\`\`\`" >> "$PROGRESS_FILE"
                echo "---" >> "$PROGRESS_FILE"
            fi
        fi
        
        # Handle verification failure
        if [[ $verification_failed -eq 1 ]]; then
            echo ""
            echo "⚠️  Verification failed — retrying next iteration"
            echo "   🔧 Next iteration will use fix-tests prompt with test output"
            log "WARN" "Verification failed on task '$current_task', will retry"

            # Log iteration timing before retry
            iteration_end_time=$(date +%s)
            iteration_duration=$((iteration_end_time - iteration_start_time))
            log "INFO" "Iteration $i completed in ${iteration_duration}s"

            sleep "$SLEEP"
            continue
        fi
        
        # Reset test failure mode on success
        test_failure_mode=0
        last_test_output=""
        log "INFO" "Verification passed"
    fi

    # ─────────────────────────────────────────────────────────
    # PUSH AFTER COMMIT (if enabled)
    # ─────────────────────────────────────────────────────────
    
    if [[ "$PUSH_AFTER_COMMIT" == "1" ]] && [[ "$SKIP_COMMIT" != "1" ]]; then
        head_after=$(git rev-parse HEAD 2>/dev/null || echo "")
        if [[ -n "$head_before" ]] && [[ "$head_before" != "$head_after" ]]; then
            log "INFO" "New commit detected, pushing to origin"
            echo "📤 Pushing changes to origin..."
            
            # Get current branch
            current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
            
            # Check if branch has upstream
            if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
                # Has upstream, simple push
                if git push 2>&1; then
                    log "INFO" "Push successful"
                    echo "✅ Pushed to origin/$current_branch"
                else
                    log "WARN" "Push failed (will retry next iteration)"
                    echo "⚠️  Push failed (will retry next iteration)"
                fi
            else
                # No upstream, push with -u
                if git push -u origin "$current_branch" 2>&1; then
                    log "INFO" "Push successful (set upstream)"
                    echo "✅ Pushed to origin/$current_branch (set upstream)"
                else
                    log "WARN" "Push failed (will retry next iteration)"
                    echo "⚠️  Push failed (will retry next iteration)"
                fi
            fi
        fi
    fi

    # ─────────────────────────────────────────────────────────
    # COMPLETION CHECK
    # ─────────────────────────────────────────────────────────

    if [[ "$result" == *"$COMPLETE_MARKER"* ]]; then
        # Verify 1: Check PRD.md for incomplete tasks
        if [[ -f "PRD.md" ]]; then
            incomplete_count=$(grep -cE '^\s*-\s*\[ \]' PRD.md 2>/dev/null || true)
            if [[ "$incomplete_count" -gt 0 ]]; then
                echo ""
                echo "==========================================="
                echo "  ⚠️  AI claimed complete but $incomplete_count tasks remain"
                echo "  Continuing to next iteration..."
                echo "==========================================="
                log "WARN" "AI claimed complete but $incomplete_count tasks remain"

                # Log iteration timing before retry
                iteration_end_time=$(date +%s)
                iteration_duration=$((iteration_end_time - iteration_start_time))
                log "INFO" "Iteration $i completed in ${iteration_duration}s"

                sleep "$SLEEP"
                continue
            fi
        fi
        
        # Verify 2: Final test run
        if [[ "$SKIP_TEST_VERIFY" != "1" ]] && [[ -n "$DETECTED_TEST_CMD" ]]; then
            echo ""
            echo "🔒 Final verification: running full test suite..."
            log "INFO" "Final test verification"
            if ! run_tests "$DETECTED_TEST_CMD"; then
                echo ""
                echo "==========================================="
                echo "  ❌ Final tests failed!"
                echo "  Continuing to fix..."
                echo "==========================================="
                log "ERROR" "Final verification failed"

                # Log iteration timing before retry
                iteration_end_time=$(date +%s)
                iteration_duration=$((iteration_end_time - iteration_start_time))
                log "INFO" "Iteration $i completed in ${iteration_duration}s"

                sleep "$SLEEP"
                continue
            fi
        fi
        
        log "INFO" "All tasks completed successfully!"
        
        # Archive completed PRD
        if [[ -f "PRD.md" ]]; then
            mkdir -p completed-prds
            timestamp=$(date +%Y%m%d-%H%M%S)
            # Try to extract title from PRD for meaningful filename
            title=$(head -1 PRD.md | sed 's/^#\s*//' | awk '{print $1, $2, $3}' | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-' | sed 's/--*/-/g')
            if [[ -n "$title" ]]; then
                archive_name="${timestamp}-${title}.md"
            else
                archive_name="${timestamp}-prd.md"
            fi
            mv PRD.md "completed-prds/${archive_name}"
            log "INFO" "Archived PRD to completed-prds/${archive_name}"
            echo "  📁 Archived: completed-prds/${archive_name}"
        fi
        
        echo "==========================================="
        echo "  ✅ All tasks complete after $i iterations!"
        echo "  ✅ All tests passing!"
        echo "  📝 Log: $LOG_FILE"
        echo "==========================================="
        
        # Notify Kai via OpenClaw wake event
        if command -v openclaw &>/dev/null; then
            openclaw cron wake "Ralph finished $PROJECT_NAME — all tasks complete after $i iterations. All tests passing." 2>/dev/null || true
        fi
        
        exit 0
    fi

    # Log iteration completion time
    iteration_end_time=$(date +%s)
    iteration_duration=$((iteration_end_time - iteration_start_time))
    log "INFO" "Iteration $i completed in ${iteration_duration}s"

    sleep "$SLEEP"
done

log "WARN" "Reached max iterations ($MAX)"
echo "==========================================="
echo "  Reached max iterations ($MAX)"
echo "  📝 Log: $LOG_FILE"
echo "==========================================="

# Notify Kai via OpenClaw wake event
if command -v openclaw &>/dev/null; then
    openclaw cron wake "Ralph hit max iterations ($MAX) on $PROJECT_NAME — tasks remain incomplete." 2>/dev/null || true
fi

exit 1
