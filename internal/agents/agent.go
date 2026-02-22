package agents

import (
	"context"

	"github.com/dominicnunez/springfield/internal/bus"
	"github.com/dominicnunez/springfield/internal/engine"
)

type AgentRole string

const (
	RolePlanner   AgentRole = "planner"
	RoleArchitect AgentRole = "architect"
	RoleBuilder   AgentRole = "builder"
	RoleVerifier  AgentRole = "verifier"
	RoleAuditor   AgentRole = "auditor"
)

type Agent interface {
	Name() string
	Role() AgentRole

	Run(ctx context.Context, input AgentInput) (*AgentOutput, error)
	RunStreamed(ctx context.Context, input AgentInput) (<-chan AgentEvent, error)
}

type AgentInput struct {
	Thread   *engine.Thread
	Worktree string
	Context  map[string]any
	Config   AgentConfig
}

type AgentConfig struct {
	Model       string
	Engine      string
	MaxTokens   int
	Temperature float64
}

type AgentOutput struct {
	Response     string
	FilesChanged []string
	TestsPassed  bool
	ACPassed     bool
	Usage        *engine.Usage
}

type AgentEvent struct {
	Type    string
	Data    any
	Agent   string
}

const (
	EventAgentStarted   = "agent.started"
	EventAgentProgress  = "agent.progress"
	EventAgentCompleted = "agent.completed"
	EventAgentFailed    = "agent.failed"
)

type BaseAgent struct {
	name   string
	role   AgentRole
	engine engine.Engine
	bus    *bus.MessageBus
	config AgentConfig
}

func NewBaseAgent(name string, role AgentRole, eng engine.Engine, bus *bus.MessageBus, config AgentConfig) *BaseAgent {
	return &BaseAgent{
		name:   name,
		role:   role,
		engine: eng,
		bus:    bus,
		config: config,
	}
}

func (a *BaseAgent) Name() string {
	return a.name
}

func (a *BaseAgent) Role() AgentRole {
	return a.role
}

func (a *BaseAgent) Engine() engine.Engine {
	return a.engine
}

func (a *BaseAgent) Bus() *bus.MessageBus {
	return a.bus
}

func (a *BaseAgent) Config() AgentConfig {
	return a.config
}
