# Springfield Kit (SFK)

Autonomous AI development kit.

## Install

```bash
npm install -g sfk

# Then use anywhere
sfk                        # Uses PRD.md with your configured engine
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

1. Configure SFK:
   ```bash
   mkdir -p ~/.sfk
   cp config.example ~/.sfk/config
   $EDITOR ~/.sfk/config
   ```

2. Create a `PRD.md` in your project with tasks:
   ```markdown
   ## Tasks
   - [ ] Implement user authentication
   - [ ] Add database migrations
   - [ ] Set up API endpoints
   ```

3. Run Ralph:
   ```bash
   sfk
   ```

Ralph will work through each task, running tests and committing progress automatically.

## CLI Usage

```bash
sfk                        # Uses PRD.md and your ~/.sfk/config settings
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

SFK uses a single INI config file under your home directory:

| Location | Purpose |
|----------|---------|
| `~/.sfk/config` | Required SFK configuration, created as a commented example on install |

### Config Priority

```
1. CLI arguments          (--model, --engine, etc.)
2. Global config          (~/.sfk/config)
```

### Global Config

Created automatically on `npm install -g sfk` as a commented example. SFK exits with a friendly setup message until you uncomment and set the required values. Excerpt:

```ini
[engine]
# type = opencode

[models]
# Only the selected engine model is required.
# claude = sonnet
# codex = gpt-5-codex
# opencode-primary = big-pickle
# effort = high               # low|medium|high|xhigh

[ralph]
# max-iterations = 10
# sleep-seconds = 2
# skip-commit = false

[willie]
# max-iterations = 0
# push-after-fix = false
```

### Required Setup

Edit `~/.sfk/config` and uncomment the values you want to use. Only the model for the selected engine is required:

```bash
mkdir -p ~/.sfk
$EDITOR ~/.sfk/config
```

Minimal OpenCode example:

```ini
[engine]
type = opencode

[models]
claude = sonnet
codex = gpt-5-codex
opencode-primary = big-pickle
effort = high

[rate-limits]
soft-retries = 3
soft-wait = 30

[ralph]
max-iterations = 10
sleep-seconds = 2
skip-commit = false
push-after-commit = false
skip-test-verify = false
max-consecutive-failures = 3
audit-after-complete = false

[willie]
max-iterations = 0
push-after-fix = false
```

### Per-Agent Model/Effort

Each agent inherits the configured engine model unless you set a per-agent override:

```ini
[engine]
type = opencode

[models]
opencode-primary = opencode/glm-5-free

[ralph]
# inherits opencode/glm-5-free
effort = high               # use xhigh for codex/opencode if desired

[willie]
# inherits opencode/glm-5-free
effort = high               # Claude rejects xhigh
```

Or override the model for a specific agent:

```ini
[willie]
model = opus              # willie uses opus instead
```

### Available Settings

See `config.example` for all available settings with documentation.

Effort levels are configured once and translated per engine at runtime:
- Claude uses `CLAUDE_CODE_EFFORT_LEVEL`
- Codex uses `model_reasoning_effort`
- OpenCode uses `--variant`

Supported levels:
- Claude: `low`, `medium`, `high`
- Codex/OpenCode: `low`, `medium`, `high`, `xhigh`

If you choose an unsupported level for the selected engine, `sfk` exits with an error.

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

If auto-detection fails or you need a custom command, set `test-cmd` under `[ralph]` in `~/.sfk/config`.

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
- **External logging** - Per-run logs at `~/.sfk/logs/<project>/<agent>/<timestamp>.log`
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

| Engine | CLI | Model Setting |
|--------|-----|---------------|
| OpenCode | `opencode` | `models.opencode-primary` |
| Claude | `claude` | `models.claude` |
| Codex | `codex` | `models.codex` |

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
bun install

# Run in dev mode
npx tsx src/index.ts --help

# Build binaries (requires Bun)
bun run build:all
```

Git hooks are installed by `bun install` in `cli/`.

- `pre-commit` runs `bun run hook:pre-commit`
- `pre-push` runs `bun run hook:pre-push`

Commit messages should use conventional commits. Bodies are optional; when
present, write them as plain prose, wrap longer explanations across multiple
lines, use `!` for breaking changes, and avoid labels like `Why:`.

If you use Nix, enter the shell first with `nix develop`, then run `cd cli && bun install`.

## Willie — Continuous Audit Loop

Willie is Ralph's counterpart: Ralph builds, Willie audits. It runs a continuous loop of audit → validate → fix until the codebase is clean.

### Usage

```bash
sfk audit                    # auto-detect source path, then audit that path
sfk audit cli/src            # audit cli/src and its subpaths only
sfk audit --max-iterations 3 # limit to 3 iterations
sfk audit --step validate    # start from validate step
sfk audit --step fix         # start from fix step
```

### Audit Prompt Resolution

Willie resolves the audit prompt in this order:

1. `--audit-prompt <path>` CLI flag
2. `audit/prompt.md` in the project root
3. `~/.sfk/audit-prompt.md` (global)
4. Built-in default prompt (security, bugs, performance, code quality)

### How It Works

Each iteration runs three steps:

1. **Audit** — Opus scans the requested source path, or first identifies the source path when none is provided, may consult categorized mirrored files under `audit/design/`, `audit/misreads/`, and `audit/risks/` selectively, and SFK filters any still-matching exceptions out of `audit/report.md` before validation
2. **Validate** — Opus reads the actual code at each finding and removes only true false positives or correct-by-design findings from the report
3. **Fix** — Opus applies proper long-term fixes, commits each semantic group, pushes only when `[willie] push-after-fix = true`, and uses categorized mirrored files only for genuine misreads, design decisions, or non-remediable risks

The loop exits when an audit produces zero findings.

### Files

All audit artifacts live in the `audit/` directory:

| File | Description |
|------|-------------|
| `audit/prompt.md` | Custom audit instructions (optional) |
| `audit/report.md` | Generated findings |
| `audit/misreads/` | False positives, stored in mirrored source paths such as `audit/misreads/src/auth.md` for `src/auth.ts` |
| `audit/design/` | Correct-by-design tradeoffs, stored in mirrored source paths such as `audit/design/src/auth.md` for `src/auth.ts` |
| `audit/risks/` | Accepted risks and non-remediable constraints, stored in mirrored source paths such as `audit/risks/src/auth.md` for `src/auth.ts` |

Exception entries identify only the source line because the category and source file are encoded in the mirrored file path. If one issue spans multiple files, add an entry to each affected file's mirrored category file:

```md
### Plain language description

**Line:** `42` — optional context

**Reason:** Explanation (can be multiple lines)
```

## Legacy Config Migration

If you're upgrading from an older version, create the new config at `~/.sfk/config` using the INI format shown above. See `config.example` for the full reference.

## License

[PolyForm Noncommercial 1.0.0](LICENSE)
