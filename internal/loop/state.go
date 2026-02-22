package loop

import (
	"github.com/dominicnunez/springfield/internal/agents"
)

type AgentState string

const (
	StateLisa    AgentState = "lisa"
	StateFrank   AgentState = "frank"
	StateRalph   AgentState = "ralph"
	StateSkinner AgentState = "skinner"
	StateMartin  AgentState = "martin"
	StateDone    AgentState = "done"
)

type StateMachine struct {
	current    AgentState
	startAgent AgentState
	flags      LoopFlags
	context    map[string]any
	outputs    map[string]*agents.AgentOutput
	loopCount  int
	kickbacks  int
}

func NewStateMachine() *StateMachine {
	return &StateMachine{
		current:   StateLisa,
		context:   make(map[string]any),
		outputs:   make(map[string]*agents.AgentOutput),
		loopCount: 0,
		kickbacks: 0,
	}
}

func (s *StateMachine) Current() string {
	return string(s.current)
}

func (s *StateMachine) SetStartAgent(name string) {
	switch name {
	case "lisa":
		s.startAgent = StateLisa
		s.current = StateLisa
	case "frank":
		s.startAgent = StateFrank
		s.current = StateFrank
	case "ralph":
		s.startAgent = StateRalph
		s.current = StateRalph
	case "skinner":
		s.startAgent = StateSkinner
		s.current = StateSkinner
	case "martin":
		s.startAgent = StateMartin
		s.current = StateMartin
	default:
		s.startAgent = StateLisa
		s.current = StateLisa
	}
}

func (s *StateMachine) SetFlags(flags LoopFlags) {
	s.flags = flags
}

func (s *StateMachine) Advance() string {
	next := s.getNextState(s.current)
	s.current = next
	return string(next)
}

func (s *StateMachine) getNextState(current AgentState) AgentState {
	switch current {
	case StateLisa:
		return StateFrank
	case StateFrank:
		return StateRalph
	case StateRalph:
		return StateSkinner
	case StateSkinner:
		output, ok := s.outputs["skinner"]
		if ok && !output.ACPassed {
			s.kickbacks++
			return StateRalph
		}
		return StateMartin
	case StateMartin:
		return StateDone
	default:
		return StateDone
	}
}

func (s *StateMachine) SetOutput(agentName string, output *agents.AgentOutput) {
	s.outputs[agentName] = output
}

func (s *StateMachine) Context() map[string]any {
	return s.context
}

func (s *StateMachine) SetContext(key string, value any) {
	s.context[key] = value
}

func (s *StateMachine) LoopCount() int {
	return s.loopCount
}

func (s *StateMachine) IncrementLoop() {
	s.loopCount++
}

func (s *StateMachine) Kickbacks() int {
	return s.kickbacks
}

func (s *StateMachine) Reset() {
	s.current = s.startAgent
	s.kickbacks = 0
	s.context = make(map[string]any)
	s.outputs = make(map[string]*agents.AgentOutput)
}

func (s *StateMachine) IsDone() bool {
	return s.current == StateDone
}
