package codex

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"

	"github.com/dominicnunez/springfield/internal/engine"
)

type CodexEngine struct {
	codexPath string
}

type CodexOptions struct {
	CodexPathOverride string
}

func New(opts CodexOptions) *CodexEngine {
	codexPath := opts.CodexPathOverride
	if codexPath == "" {
		codexPath = findCodexBinary()
	}

	return &CodexEngine{
		codexPath: codexPath,
	}
}

func (e *CodexEngine) Name() string {
	return "codex"
}

func (e *CodexEngine) IsAvailable() bool {
	return e.codexPath != ""
}

func (e *CodexEngine) StartThread(ctx context.Context, opts engine.ThreadOptions) (*engine.Thread, error) {
	return nil, fmt.Errorf("not implemented: StartThread")
}

func (e *CodexEngine) ResumeThread(ctx context.Context, threadID string, opts engine.ThreadOptions) (*engine.Thread, error) {
	return nil, fmt.Errorf("not implemented: ResumeThread")
}

func (e *CodexEngine) Run(ctx context.Context, thread *engine.Thread, input string) (*engine.Turn, error) {
	return nil, fmt.Errorf("not implemented: Run")
}

func (e *CodexEngine) RunStreamed(ctx context.Context, thread *engine.Thread, input string) (<-chan engine.Event, error) {
	events := make(chan engine.Event, 100)

	go func() {
		defer close(events)
		events <- engine.Event{
			Type: engine.DefaultEventTypes.Error,
			Data: engine.ErrorEventData{Message: "not implemented"},
		}
	}()

	return events, nil
}

func findCodexBinary() string {
	if path := os.Getenv("CODEX_PATH"); path != "" {
		return path
	}

	binaryName := "codex"
	if runtime.GOOS == "windows" {
		binaryName = "codex.exe"
	}

	if path, err := exec.LookPath(binaryName); err == nil {
		return path
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	candidates := []string{
		fmt.Sprintf("%s/.codex/bin/%s", home, binaryName),
		fmt.Sprintf("%s/.local/bin/%s", home, binaryName),
		fmt.Sprintf("/usr/local/bin/%s", binaryName),
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	return ""
}
