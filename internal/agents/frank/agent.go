package frank

import (
	"context"
	"fmt"

	"github.com/dominicnunez/springfield/internal/agents"
	"github.com/dominicnunez/springfield/internal/bus"
	"github.com/dominicnunez/springfield/internal/engine"
)

type Frank struct {
	*agents.BaseAgent
}

func New(eng engine.Engine, bus *bus.MessageBus, config agents.AgentConfig) *Frank {
	return &Frank{
		BaseAgent: agents.NewBaseAgent("frank", agents.RoleArchitect, eng, bus, config),
	}
}

func (a *Frank) Run(ctx context.Context, input agents.AgentInput) (*agents.AgentOutput, error) {
	return nil, fmt.Errorf("not implemented: frank.Run")
}

func (a *Frank) RunStreamed(ctx context.Context, input agents.AgentInput) (<-chan agents.AgentEvent, error) {
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
