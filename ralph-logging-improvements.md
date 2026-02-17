# Ralph Logging Improvements

**Context:** Ralph got SIGKILL'd during iteration 8 with no error logged. Need better visibility into why processes die.

## Problem
- SIGKILL can't be trapped (process dies immediately)
- No resource/state logging before death
- Hard to distinguish: OOM, API limits, network issues, Claude Code crashes

## Proposed Improvements

### 1. Heartbeat/Resource Logging
Log at the start of each iteration:
```bash
log_resources() {
    local mem_used=$(free -m | awk '/Mem:/ {print $3}')
    local mem_total=$(free -m | awk '/Mem:/ {print $2}')
    local load=$(cat /proc/loadavg | cut -d' ' -f1-3)
    log "INFO" "Resources: Memory ${mem_used}/${mem_total}MB, Load: ${load}"
}
```

### 2. Claude Code Exit Code Capture
```bash
claude_output=$(claude --model "$MODEL" ... 2>&1)
claude_exit=$?
if [[ $claude_exit -ne 0 ]]; then
    log "ERROR" "Claude Code exited with code $claude_exit"
    log "ERROR" "Last output: ${claude_output: -500}"  # Last 500 chars
fi
```

### 3. Signal Trapping (for trappable signals)
```bash
cleanup() {
    local signal=$1
    log "WARN" "Received signal: $signal"
    log "WARN" "Last iteration: $current_iteration"
    log "WARN" "Last task: $current_task"
    # Save state for resume
    echo "$current_iteration" > "$STATE_DIR/last_iteration"
}

trap 'cleanup SIGTERM' SIGTERM
trap 'cleanup SIGINT' SIGINT
trap 'cleanup SIGHUP' SIGHUP
```

### 4. Watchdog/Heartbeat File
Write a timestamp every 30s so external monitoring can detect stalls:
```bash
watchdog() {
    while true; do
        echo "$(date +%s) iteration=$current_iteration task=$current_task" > "$STATE_DIR/heartbeat"
        sleep 30
    done
}
watchdog &
WATCHDOG_PID=$!
```

### 5. Claude Code Session Logging
If Claude Code has its own logs, tail them:
```bash
# Check common locations
CLAUDE_LOG="${HOME}/.claude/logs/latest.log"
if [[ -f "$CLAUDE_LOG" ]]; then
    log "INFO" "Claude Code log: $(tail -5 "$CLAUDE_LOG")"
fi
```

### 6. Iteration Timing
Track how long each iteration takes — helps identify if one is hanging:
```bash
iteration_start=$(date +%s)
# ... do work ...
iteration_end=$(date +%s)
duration=$((iteration_end - iteration_start))
log "INFO" "Iteration $i completed in ${duration}s"
```

## Implementation Priority
1. **High:** Exit code capture + signal trapping (easy wins)
2. **Medium:** Resource logging at iteration start
3. **Low:** Watchdog (more complex, may not help with SIGKILL)

## Notes
- SIGKILL (OOM killer, external kill -9) can't be caught
- Best defense is logging state frequently so we can diagnose post-mortem
- Consider: is Anthropic rate-limiting long Opus sessions?
