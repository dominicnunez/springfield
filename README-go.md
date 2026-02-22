# Springfield Go

Parallel Autonomous AI Coding Toolkit

## Build

```bash
make build
```

## Development

```bash
make run ARGS="lisa --help"
make run ARGS="ralph"
```

## Test

```bash
make test
```

## Agents

| Agent | Role | Description |
|-------|------|-------------|
| lisa | Planner | Creates PRD, asks questions if needed |
| frank | Architect | Designs solution, produces technical spec |
| ralph | Builder | Implements code from spec |
| skinner | Verifier | Lint + Verify + AC Check |
| martin | Auditor | Finds bugs, passes back to lisa |

## Commands

```bash
sfk lisa [prompt]      # Run Lisa (Planner)
sfk frank [prompt]     # Run Frank (Architect)
sfk ralph [prompt]     # Run Ralph (Builder)
sfk skinner [prompt]   # Run Skinner (Verifier)
sfk martin [prompt]    # Run Martin (Auditor)
sfk bart               # Project setup wizard
sfk worktree list      # List worktrees
sfk worktree create    # Create worktree
sfk worktree delete    # Delete worktree
```

## Flags

| Flag | Description |
|------|-------------|
| `-x, --exit` | Exit after current phase (no loop) |
| `-i, --interactive` | Force interactive mode |
| `-fa, --full-audit` | Full codebase audit every loop |
| `-l, --loops N` | Number of loops to run (0 = infinite) |
| `-v, --verbose` | Enable verbose output |
| `-c, --config PATH` | Path to config file |
| `-e, --engine NAME` | Engine to use (opencode, codex) |
