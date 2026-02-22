package loop

import (
	"context"
	"fmt"

	"github.com/dominicnunez/springfield/internal/agents"
	"github.com/dominicnunez/springfield/internal/bus"
	"github.com/dominicnunez/springfield/internal/config"
	"github.com/dominicnunez/springfield/internal/engine"
	"github.com/dominicnunez/springfield/internal/worktree"
)

type LoopFlags struct {
	ExitAfterPhase bool
	LoopCount      int
	FullAudit      bool
	Interactive    bool
}

type LoopController struct {
	bus       *bus.MessageBus
	worktrees *worktree.Manager
	engineA   engine.Engine
	engineB   engine.Engine
	config    *config.Config
	agents    map[string]agents.Agent
}

func NewController(
	bus *bus.MessageBus,
	worktrees *worktree.Manager,
	engineA, engineB engine.Engine,
	cfg *config.Config,
) *LoopController {
	return &LoopController{
		bus:       bus,
		worktrees: worktrees,
		engineA:   engineA,
		engineB:   engineB,
		config:    cfg,
		agents:    make(map[string]agents.Agent),
	}
}

func (c *LoopController) RegisterAgent(name string, agent agents.Agent) {
	c.agents[name] = agent
}

func (c *LoopController) Run(ctx context.Context, startAgent string, flags LoopFlags) error {
	state := NewStateMachine()

	state.SetStartAgent(startAgent)
	state.SetFlags(flags)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		currentAgent := state.Current()
		if currentAgent == "" {
			return nil
		}

		agent, ok := c.agents[currentAgent]
		if !ok {
			return fmt.Errorf("agent not found: %s", currentAgent)
		}

		input := agents.AgentInput{
			Context: state.Context(),
			Config: agents.AgentConfig{
				Model:  c.getModelForAgent(currentAgent),
				Engine: c.config.Defaults.Engine,
			},
		}

		output, err := agent.Run(ctx, input)
		if err != nil {
			return fmt.Errorf("agent %s failed: %w", currentAgent, err)
		}

		state.SetOutput(currentAgent, output)

		if flags.ExitAfterPhase {
			return nil
		}

		nextAgent := state.Advance()
		if nextAgent == "" {
			if flags.LoopCount > 0 {
				state.IncrementLoop()
				if state.LoopCount() >= flags.LoopCount {
					return nil
				}
			}
			state.Reset()
		}
	}
}

func (c *LoopController) getModelForAgent(agentName string) string {
	switch agentName {
	case "lisa":
		return c.config.Models.Lisa
	case "frank":
		return c.config.Models.Frank
	case "ralph":
		return c.config.Models.Ralph
	case "skinner":
		return c.config.Models.Skinner
	case "martin":
		return c.config.Models.Martin
	default:
		return "sonnet"
	}
}

func (c *LoopController) executeAgent(ctx context.Context, agent agents.Agent, input agents.AgentInput) (*agents.AgentOutput, error) {
	return agent.Run(ctx, input)
}

func (c *LoopController) handleKickback(ctx context.Context, fromAgent, toAgent string, reason string) error {
	c.bus.Publish(bus.TopicRalphKickback, bus.Message{
		Type:      bus.TopicRalphKickback,
		FromAgent: fromAgent,
		ToAgent:   toAgent,
		Payload: bus.RalphKickbackPayload{
			ErrorMessage: reason,
		},
	})
	return nil
}

func (c *LoopController) escalateToLisa(ctx context.Context, reason string) error {
	c.bus.Publish(bus.TopicLisaEscalation, bus.Message{
		Type:      bus.TopicLisaEscalation,
		Payload: bus.LisaEscalationPayload{
			Reason: reason,
		},
	})
	return nil
}
