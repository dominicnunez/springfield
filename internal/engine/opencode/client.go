package opencode

import (
	"context"
	"fmt"
	"os"
	"os/exec"

	"github.com/dominicnunez/springfield/internal/engine"
)

type OpenCodeEngine struct {
	model         string
	fallbackModel string
	usingFallback bool
}

type OpenCodeOptions struct {
	Model         string
	FallbackModel string
}

func New(opts OpenCodeOptions) *OpenCodeEngine {
	return &OpenCodeEngine{
		model:         opts.Model,
		fallbackModel: opts.FallbackModel,
		usingFallback: false,
	}
}

func (e *OpenCodeEngine) Name() string {
	return "opencode"
}

func (e *OpenCodeEngine) IsAvailable() bool {
	_, err := exec.LookPath("opencode")
	return err == nil
}

func (e *OpenCodeEngine) StartThread(ctx context.Context, opts engine.ThreadOptions) (*engine.Thread, error) {
	return nil, fmt.Errorf("not implemented: StartThread")
}

func (e *OpenCodeEngine) ResumeThread(ctx context.Context, threadID string, opts engine.ThreadOptions) (*engine.Thread, error) {
	return nil, fmt.Errorf("not implemented: ResumeThread")
}

func (e *OpenCodeEngine) Run(ctx context.Context, thread *engine.Thread, input string) (*engine.Turn, error) {
	return nil, fmt.Errorf("not implemented: Run")
}

func (e *OpenCodeEngine) RunStreamed(ctx context.Context, thread *engine.Thread, input string) (<-chan engine.Event, error) {
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

func (e *OpenCodeEngine) SwitchToFallback() bool {
	if e.fallbackModel != "" && !e.usingFallback {
		e.model = e.fallbackModel
		e.usingFallback = true
		return true
	}
	return false
}

func (e *OpenCodeEngine) ResetToPrimary() {
	e.model = e.fallbackModel
	e.usingFallback = false
}

func (e *OpenCodeEngine) IsUsingFallback() bool {
	return e.usingFallback
}

func (e *OpenCodeEngine) Model() string {
	return e.model
}

func findOpenCodeBinary() string {
	if path := os.Getenv("OPENCODE_PATH"); path != "" {
		return path
	}

	if path, err := exec.LookPath("opencode"); err == nil {
		return path
	}

	return ""
}
