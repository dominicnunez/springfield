# Example PRD — URL Shortener API

A simple Go HTTP API to demonstrate sfk's workflow. Stores shortened URLs in memory, redirects on lookup.

## Tasks

- [ ] Create `go.mod` with module path `github.com/example/urlshort`, Go 1.25
- [ ] Create `store_test.go` with tests for an in-memory URL store: `Put(short, long)` stores a mapping, `Get(short)` retrieves it, `Get` on missing key returns empty string and false
- [ ] Create `store.go` implementing the in-memory URL store backed by a `sync.RWMutex`-protected map. All tests in `store_test.go` must pass.
- [ ] Create `handler_test.go` with tests using `net/http/httptest`: POST `/shorten` with JSON body `{"url":"https://example.com"}` returns 201 with `{"short":"<id>"}`, GET `/:id` for a known short code returns 301 redirect to the long URL, GET `/:id` for an unknown code returns 404
- [ ] Create `handler.go` with HTTP handlers for POST `/shorten` (generates a random 6-char short code, stores mapping, returns JSON) and GET `/:id` (looks up short code, redirects or 404). All tests in `handler_test.go` must pass.
- [ ] Create `main.go` with server startup on `:8080`, wiring the store and handlers together. Include a health check endpoint at GET `/health` that returns 200.

---

## Writing Good Tasks

### Each Task Is a Fresh Context

sfk spawns a fresh AI instance for each task with no memory of previous work. The task description is ALL the context it gets. Be specific — if a task needs to know about a file created by a previous task, mention the file name and what's in it.

### Test-First Development

Write test tasks before implementation tasks. The tests define the contract — then the implementation makes them pass. This catches spec drift early and gives sfk a clear success signal.

**Good — test first:**
```
- [ ] Create `store_test.go` with tests for Put/Get operations on an in-memory store
- [ ] Create `store.go` implementing the store. All tests in `store_test.go` must pass.
```

**Bad — tests as afterthought:**
```
- [ ] Create store with Put/Get methods
- [ ] Add tests for the store
```

### Keep Tasks Atomic

Each task must be completable in one pass (~10 min of work). If you can't describe the change in 2-3 sentences, split it up.

**Right-sized tasks:**
- Create one file with its types and functions
- Add one endpoint with its handler
- Write tests for one module

**Too big (split these up):**

| Too Big | Split Into |
|---------|-----------|
| "Build the API" | Store, handlers, main — separate tasks |
| "Add all endpoints" | One task per endpoint or logical group |
| "Set up project with full config" | go.mod first, then config files separately |

### Order by Dependencies

Tasks run top-to-bottom. Earlier tasks must NOT depend on later ones.

**Correct order:**
1. Project setup (go.mod, config)
2. Tests for core types/utilities
3. Core implementation (make tests pass)
4. Tests for features that use the core
5. Feature implementation (make tests pass)
6. Integration / wiring (main.go, CLI entry points)
7. Docs, polish, final verification

### End Implementation Tasks with a Test Gate

Every implementation task should end with "All tests in `X_test.go` must pass." This gives sfk an unambiguous success condition.

### Include a Final Verification Phase

For any non-trivial project, add a final phase that runs the full build/test/lint/vet pipeline:

```
- [ ] Run `go mod tidy` — verify clean deps
- [ ] Run `go vet ./...` — fix any issues
- [ ] Run `go test -race ./...` — no data races
- [ ] Run `go build ./...` — clean compilation
```

---

## Usage

```bash
cd /your/project
sfk run                 # uses PRD.md in current directory
sfk run --model opus    # use Opus for complex work
sfk audit               # deep code audit, loops until convergence
```

## Notes

- Tasks are marked complete (`- [x]`) when tests pass
- If tests fail, the task is retried until passing
- sfk auto-commits after each successful task
- One sfk at a time — don't run multiple instances concurrently
