package skinner

import (
	"context"
	"fmt"

	"github.com/dominicnunez/springfield/internal/agents"
	"github.com/dominicnunez/springfield/internal/bus"
	"github.com/dominicnunez/springfield/internal/engine"
)

type Skinner struct {
	*agents.BaseAgent
	maxKickbacks int
}

func New(eng engine.Engine, bus *bus.MessageBus, config agents.AgentConfig, maxKickbacks int) *Skinner {
	return &Skinner{
		BaseAgent:     agents.NewBaseAgent("skinner", agents.RoleVerifier, eng, bus, config),
		maxKickbacks: maxKickbacks,
	}
}

func (a *Skinner) Run(ctx context.Context, input agents.AgentInput) (*agents.AgentOutput, error) {
	return nil, fmt.Errorf("not implemented: skinner.Run")
}

func (a *Skinner) RunStreamed(ctx context.Context, input agents.AgentInput) (<-chan agents.AgentEvent, error) {
	events := make(chan agents.AgentEvent, 100)

	go func() {
		defer close(events)
		events <- agents.AgentEvent{
			Type:  agents.EventAgentFailed,
			Agent: a.Name(),
			Data:  map[string]string{"error": "not implemented"},
		}
	}()

	return events, nil
}

func (a *Skinner) MaxKickbacks() int {
	return a.maxKickbacks
}
