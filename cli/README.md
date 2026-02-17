# sfs-ai

**Ship First, Ship Fast** — An autonomous AI coding agent with enforced test verification.

Ralph runs your AI coding assistant (OpenCode or Claude) in a loop, working through tasks from a PRD one at a time. The key differentiator: **it won't mark tasks complete unless tests are written and passing.**

## Install

```bash
npm install -g sfs-ai

# or with bun
bun install -g sfs-ai
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
   sfs
   ```

Ralph works through each task, running tests and committing progress automatically.

## Usage

```bash
sfs                        # Uses PRD.md with OpenCode (default)
sfs --claude               # Use Claude Code instead
sfs --model opus           # Override model
sfs --max-iterations 20    # Limit iterations
sfs --skip-commit          # Don't auto-commit
sfs --no-tests             # Skip test verification (not recommended)
sfs --prd tasks.md         # Use different PRD file
sfs -v                     # Verbose output
```

## Configuration

**Global:** `~/.config/ralph/ralph.env`  
**Project:** `.ralph/ralph.env`

```bash
ENGINE=opencode            # or 'claude'
OC_PRIME_MODEL=opus        # Primary model
MAX_ITERATIONS=-1          # -1 = infinite
SKIP_COMMIT=0              # 1 = disable auto-commit
SKIP_TEST_VERIFY=0         # 1 = skip test checks (not recommended)
PUSH_AFTER_COMMIT=0        # 1 = push after each commit
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

Override with `TEST_CMD` in config if needed.

## Requirements

- Node.js 18+ or Bun
- [OpenCode](https://opencode.ai) and/or [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

## Links

- [Full Documentation](https://github.com/dominicnunez/ralph)
- [Report Issues](https://github.com/dominicnunez/ralph/issues)

## License

MIT
