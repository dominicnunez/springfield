package ralph

import (
	"context"
	"fmt"

	"github.com/dominicnunez/springfield/internal/agents"
	"github.com/dominicnunez/springfield/internal/bus"
	"github.com/dominicnunez/springfield/internal/engine"
)

type Ralph struct {
	*agents.BaseAgent
}

func New(eng engine.Engine, bus *bus.MessageBus, config agents.AgentConfig) *Ralph {
	return &Ralph{
		BaseAgent: agents.NewBaseAgent("ralph", agents.RoleBuilder, eng, bus, config),
	}
}

func (a *Ralph) Run(ctx context.Context, input agents.AgentInput) (*agents.AgentOutput, error) {
	return nil, fmt.Errorf("not implemented: ralph.Run")
}

func (a *Ralph) RunStreamed(ctx context.Context, input agents.AgentInput) (<-chan agents.AgentEvent, error) {
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
