# sfk

**Springfield Kit** — An autonomous AI coding agent with enforced test verification.

Ralph runs your AI coding assistant (OpenCode, Claude, or Codex) in a loop, working through tasks from a PRD one at a time. The key differentiator: **it won't mark tasks complete unless tests are written and passing.**

## Install

```bash
npm install -g sfk

# or with bun
bun install -g sfk
```

## Quick Start

1. Create a `PRD.md` with tasks:
   ```markdown
   ## Tasks
   - [ ] Implement user authentication
   - [ ] Add database migrations
   - [ ] Set up API endpoints
   ```

2. Run:
   ```bash
   sfk
   ```

Ralph works through each task, running tests and committing progress automatically.

## Usage

```bash
sfk                        # Uses PRD.md with OpenCode (default)
sfk --claude               # Use Claude Code instead
sfk --codex                # Use Codex CLI instead
sfk --model opus           # Override model
sfk --max-iterations 20    # Limit iterations
sfk --skip-commit          # Don't auto-commit
sfk --no-tests             # Skip test verification (not recommended)
sfk --prd tasks.md         # Use different PRD file
sfk -v                     # Verbose output
```

## Configuration

**Global:** `~/.config/sfk/config`
**Project:** `.sfk/config`

```ini
[engine]
type = opencode

[models]
claude = sonnet
claude-effort = high
# codex = gpt-5-codex
opencode-primary = opencode/glm-5-free

[ralph]
max-iterations = -1
skip-commit = false
push-after-commit = false
```

## How It Works

```
Task 1 → AI implements → tests written? → NO → retry
                                        → YES → run tests → FAIL → retry
                                                          → PASS → commit → Task 2
```

Each iteration:
1. Finds first incomplete task in `PRD.md`
2. AI implements exactly ONE task
3. Verifies test files were created/modified
4. Runs full test suite
5. If passing: marks complete, commits, logs progress
6. If failing: logs details for next iteration

## Test Auto-Detection

Ralph detects your test framework automatically:

| Project Type | Test Command |
|--------------|--------------|
| Node (package.json) | `npm test` / `bun test` |
| Go | `go test ./...` |
| Rust | `cargo test` |
| Python | `pytest` |

Override with `test-cmd` under `[ralph]` in config if needed.

## Requirements

- Node.js 18+ or Bun
- [OpenCode](https://opencode.ai), [Claude Code](https://docs.anthropic.com/en/docs/claude-code), and/or [Codex CLI](https://github.com/openai/codex)

## Links

- [Full Documentation](https://github.com/dominicnunez/ralph)
- [Report Issues](https://github.com/dominicnunez/ralph/issues)

## License

MIT
