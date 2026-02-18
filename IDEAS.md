# Roadmap

Planned features for future releases, ordered by value.

## Planned Features

| # | Feature | Effort | Value | Description |
|---|---------|--------|-------|-------------|
| 1 | `--init` command | Medium | High | Auto-detect project settings, create config with detected test/lint/build commands |
| 2 | YAML PRD support | Medium | Medium | Allows parallel groups and task descriptions |
| 3 | Single task mode | Low | Medium | `sfs "add login button"` without a PRD file |
| 4 | `--add-rule` command | Low | Low | Quick way to add rules to config |
| 5 | Parallel execution | High | Medium | Run multiple tasks concurrently with git worktrees |
| 6 | GitHub Issues as PRD | High | Low | `--github owner/repo` to pull tasks from issues |
| 7 | Branch-per-task | Medium | Low | Create separate branches for each task |
| 8 | Browser automation | High | Low | Integration with agent-browser |

## Feature Details

### 1. `--init` command

```bash
sfs --init
```

Auto-detects:
- Project name from package.json or directory
- Language (TypeScript, Python, Go, Rust, etc.)
- Framework (Next.js, SvelteKit, FastAPI, etc.)
- Test command (`npm test`, `pytest`, `go test`, etc.)
- Lint command (`npm run lint`, `ruff`, etc.)
- Build command (`npm run build`, `cargo build`, etc.)

Creates a `.ralph/config.yaml` with detected settings.

### 2. YAML PRD support

```bash
sfs --yaml tasks.yaml
```

Enables:
- Task descriptions (multi-line context for AI)
- Parallel groups (tasks that can run concurrently)

```yaml
tasks:
  - title: Create database schema
    completed: false
    parallel_group: 1
    description: |
      Design the initial schema for users and tasks.
      Use PostgreSQL with Drizzle ORM.

  - title: Set up authentication
    completed: false
    parallel_group: 1
```

### 3. Single task mode

```bash
sfs "add dark mode toggle"
sfs "fix the login bug"
```

Run a single task without creating a PRD file. Useful for quick fixes.

### 4. `--add-rule` command

```bash
sfs --add-rule "use server actions, not API routes"
sfs --add-rule "follow the error pattern in src/utils/errors.ts"
```

Quickly add project-specific rules that the AI must follow.

### 5. Parallel execution

```bash
sfs --parallel
sfs --parallel --max-parallel 5
```

Run multiple tasks concurrently using git worktrees:
- Each agent gets an isolated worktree and branch
- Changes merge back to base branch automatically
- AI resolves merge conflicts

### 6. GitHub Issues as PRD

```bash
sfs --github owner/repo
sfs --github owner/repo --github-label "ready"
```

Pull tasks directly from GitHub issues instead of a PRD file.

### 7. Branch-per-task

```bash
sfs --branch-per-task
sfs --branch-per-task --create-pr
```

Create a separate branch for each task. Optionally create PRs automatically.

### 8. Browser automation

```bash
sfs "test the login flow" --browser
```

Integration with [agent-browser](https://agent-browser.dev) for:
- Testing UI after implementing features
- Verifying deployments
- Form filling and workflow testing

## Contributing

Want to help implement a feature? PRs welcome! Start with the lower-effort items (3, 4) or tackle a high-value one (1, 2).
