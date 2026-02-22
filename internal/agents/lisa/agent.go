package lisa

import (
	"context"
	"fmt"

	"github.com/dominicnunez/springfield/internal/agents"
	"github.com/dominicnunez/springfield/internal/bus"
	"github.com/dominicnunez/springfield/internal/engine"
)

type Lisa struct {
	*agents.BaseAgent
}

func New(eng engine.Engine, bus *bus.MessageBus, config agents.AgentConfig) *Lisa {
	return &Lisa{
		BaseAgent: agents.NewBaseAgent("lisa", agents.RolePlanner, eng, bus, config),
	}
}

func (a *Lisa) Run(ctx context.Context, input agents.AgentInput) (*agents.AgentOutput, error) {
	return nil, fmt.Errorf("not implemented: lisa.Run")
}

func (a *Lisa) RunStreamed(ctx context.Context, input agents.AgentInput) (<-chan agents.AgentEvent, error) {
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
