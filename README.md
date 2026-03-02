# Springfield Kit (SFK)

Autonomous AI development kit.

## Install

```bash
npm install -g sfk

# Then use anywhere
sfk                        # Uses PRD.md with OpenCode (default)
sfk --claude               # Use Claude Code
sfk --codex                # Use Codex CLI
sfk --model sonnet         # Override model
```

## Overview

Ralph runs an AI coding assistant in a loop, feeding it tasks from a PRD (Product Requirements Document) and tracking progress across iterations. Each iteration:

1. Reads `PRD.md` to find the first incomplete task
2. Reads progress file from `~/.sfk/progress/` to learn from previous iterations
3. Implements exactly ONE task
4. **Verifies test files were created/modified**
5. **Runs tests to verify the implementation**
6. If tests pass: marks task complete, commits, and logs progress
7. If tests fail: logs failure details for the next iteration

## Quick Start

1. Create a `PRD.md` in your project with tasks:
   ```markdown
   ## Tasks
   - [ ] Implement user authentication
   - [ ] Add database migrations
   - [ ] Set up API endpoints
   ```

2. Run Ralph:
   ```bash
   sfk
   ```

Ralph will work through each task, running tests and committing progress automatically.

## CLI Usage

```bash
sfk                        # Uses PRD.md, OpenCode engine (default)
sfk --opencode             # Explicit OpenCode
sfk --claude               # Use Claude Code
sfk --codex                # Use Codex CLI
sfk --model big-pickle     # Override model
sfk --max-iterations 20    # Custom iteration limit
sfk --skip-commit          # Don't auto-commit
sfk --no-tests             # Skip test verification (not recommended)
sfk --prd tasks.md         # Use different PRD file
sfk -v                     # Verbose output
sfk --help                 # Show all options
```

## Configuration

SFK uses a two-level INI config system:

| Location | Purpose |
|----------|---------|
| `~/.config/sfk/config` | Global defaults (created on install) |
| `.sfk/config` | Project-specific overrides |

### Config Priority

```
1. CLI arguments          (--model, --engine, etc.)
2. Environment variables  (OC_PRIME_MODEL, etc.)
3. Project config         (.sfk/config)
4. Global config          (~/.config/sfk/config)
```

### Global Config

Created automatically on `npm install -g sfk` with sensible defaults:

```ini
[engine]
type = opencode

[models]
claude = sonnet
claude-effort = high
# codex = gpt-5-codex
opencode-primary = big-pickle

[ralph]
max-iterations = 10
sleep-seconds = 2
skip-commit = false

[willie]
max-iterations = 0
```

### Project Config

Create `.sfk/config` to override settings for a specific project:

```bash
mkdir -p .sfk
cat > .sfk/config << 'EOF'
[engine]
type = claude

[ralph]
model = opus
effort = high
test-cmd = npm run test:ci
EOF
```

### Per-Agent Model/Effort

Each agent inherits the engine's primary model by default. Override per-agent if needed:

```ini
[engine]
type = opencode

[models]
opencode-primary = opencode/glm-5-free  # global default

[ralph]
# inherits opencode/glm-5-free by default
effort = high

[willie]
# inherits opencode/glm-5-free by default
effort = high
```

Or override the model for a specific agent:

```ini
[willie]
model = opus              # willie uses opus instead
```

### Available Settings

See `config.example` for all available settings with documentation.

### Test Auto-Detection

Ralph automatically detects your test command based on project files:

| Detected File | Test Command |
|---------------|--------------|
| `package.json` with `test` script | `npm test` / `bun test` / `pnpm test` / `yarn test` |
| `vitest.config.ts` | `npx vitest run` |
| `jest.config.ts` | `npx jest` |
| `pytest.ini` or `pyproject.toml` | `pytest` |
| `go.mod` | `go test ./...` |
| `Cargo.toml` | `cargo test` |

If auto-detection fails or you need a custom command, set `test-cmd` under `[ralph]` in your config.

## Project Files

| File | Description |
|------|-------------|
| `PRD.md` | Task list with checkbox format (required) |
| `~/.sfk/progress/progress-<project>.log` | Centralized progress tracking across iterations |
| `AGENTS.md` | Reusable patterns for the codebase (optional) |

## Key Features

- **One task per iteration** - Ensures atomic, testable changes
- **Enforced test writing** - Verifies test files were actually created/modified
- **Test-gated completion** - Runs test suite after each iteration, blocks progress on failure
- **Double verification** - PRD.md check + final test suite before declaring complete
- **Progress persistence** - Learnings survive across iterations in `~/.sfk/progress/`
- **External logging** - Per-project logs at `~/.sfk/logs/sfk-<project>.log`
- **Auto-commit** - Commits changes automatically with descriptive messages
- **Automatic fallback** - Switches to fallback model on rate limits (OpenCode)
- **Skip commits** - Test PRDs without polluting git history
- **Configurable** - Per-agent model and effort settings

## Test Verification Flow

```
Task 1 -> AI implements -> tests written? -> NO -> retry iteration
                                          -> YES -> run tests -> FAIL -> retry
                                                              -> PASS -> Task 2 -> ...
All [x] -> final test suite -> PASS -> done
                            -> FAIL -> keep iterating
```

The script independently verifies:
1. Test files were created/modified (*.test.ts, *.spec.ts, etc.)
2. Full test suite passes after each iteration
3. Final test suite passes before declaring complete

This prevents the AI from marking tasks complete without actually writing tests.

## AI Engines

| Engine | CLI | Default Model |
|--------|-----|---------------|
| OpenCode | `opencode` | `big-pickle` |
| Claude | `claude` | `sonnet` |
| Codex | `codex` | Codex CLI default |

### Rate Limit Handling (OpenCode)

If a rate limit is detected and `opencode-fallback` is configured, Ralph automatically switches to the fallback model and retries.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All tasks completed successfully |
| 1 | Max iterations reached or error occurred |

## Requirements

- Node.js 18+ or Bun
- [OpenCode CLI](https://opencode.ai) (`opencode` command) - for OpenCode engine
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude` command) - for Claude engine
- [Codex CLI](https://github.com/openai/codex) (`codex` command) - for Codex engine

## Development

```bash
# Clone and install
git clone https://github.com/dominicnunez/springfield.git
cd springfield/cli
npm install

# Run in dev mode
npx tsx src/index.ts --help

# Build binaries (requires Bun)
bun run build:all
```

## Willie — Continuous Audit Loop

Willie is Ralph's counterpart: Ralph builds, Willie audits. It runs a continuous loop of audit → validate → fix until the codebase is clean.

### Usage

```bash
sfk audit                    # full loop, uses built-in audit prompt
sfk audit --max-iterations 3 # limit to 3 iterations
sfk audit --start validate   # start from validate step
sfk audit --start fix        # start from fix step
```

### Audit Prompt Resolution

Willie resolves the audit prompt in this order:

1. `--audit-prompt <path>` CLI flag
2. `audit/prompt.md` in the project root
3. `~/.config/sfk/audit-prompt.md` (global)
4. Built-in default prompt (security, bugs, performance, code quality)

### How It Works

Each iteration runs three steps:

1. **Audit** — Opus scans the codebase using the audit prompt, writes findings to `audit/report.md`
2. **Validate** — Opus reads the actual code at each finding, moves false positives to `audit/exceptions.md`
3. **Fix** — Opus applies proper long-term fixes, commits each one, deletes the report when done

The loop exits when an audit produces zero findings.

### Files

All audit artifacts live in the `audit/` directory:

| File | Description |
|------|-------------|
| `audit/prompt.md` | Custom audit instructions (optional) |
| `audit/report.md` | Generated findings |
| `audit/exceptions.md` | Documented intentional tradeoffs and false positives |

## Legacy Config Migration

If you're upgrading from an older version that used `.ralph/ralph.env` or `~/.config/ralph/ralph.env`, SFK will detect the old config, warn you, and fall back to reading it. To migrate, create the new config at `~/.config/sfk/config` using the INI format shown above. See `config.example` for the full reference.

## License

[PolyForm Noncommercial 1.0.0](LICENSE)
