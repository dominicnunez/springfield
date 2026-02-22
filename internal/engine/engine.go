package engine

import (
	"context"
)

type Engine interface {
	Name() string

	StartThread(ctx context.Context, opts ThreadOptions) (*Thread, error)
	ResumeThread(ctx context.Context, threadID string, opts ThreadOptions) (*Thread, error)

	Run(ctx context.Context, thread *Thread, input string) (*Turn, error)
	RunStreamed(ctx context.Context, thread *Thread, input string) (<-chan Event, error)

	IsAvailable() bool
}

type ThreadOptions struct {
	WorkingDirectory string
	Images           []string
}

type TurnOptions struct {
	OutputSchema map[string]any
}

type Thread struct {
	ID     string
	Engine string
	Status ThreadStatus
}

type ThreadStatus string

const (
	ThreadStatusActive    ThreadStatus = "active"
	ThreadStatusCompleted ThreadStatus = "completed"
	ThreadStatusFailed    ThreadStatus = "failed"
)

type Turn struct {
	FinalResponse string
	Usage         *Usage
	Items         []Item
}

type Usage struct {
	InputTokens  int
	OutputTokens int
	TotalTokens  int
}

type Item struct {
	Type string
	Data any
}

type Event struct {
	Type string
	Data any
}

type EventTypes struct {
	ThreadStarted  string
	TurnStarted    string
	TurnCompleted  string
	TurnFailed     string
	ItemStarted    string
	ItemUpdated    string
	ItemCompleted  string
	Error          string
}

var DefaultEventTypes = EventTypes{
	ThreadStarted:  "thread.started",
	TurnStarted:    "turn.started",
	TurnCompleted:  "turn.completed",
	TurnFailed:     "turn.failed",
	ItemStarted:    "item.started",
	ItemUpdated:    "item.updated",
	ItemCompleted:  "item.completed",
	Error:          "error",
}

type ItemTypes struct {
	AgentMessage       string
	Reasoning          string
	CommandExecution   string
	FileChange         string
	McpToolCall        string
	WebSearch          string
	TodoList           string
	Error              string
}

var DefaultItemTypes = ItemTypes{
	AgentMessage:       "agent_message",
	Reasoning:          "reasoning",
	CommandExecution:   "command_execution",
	FileChange:         "file_change",
	McpToolCall:        "mcp_tool_call",
	WebSearch:          "web_search",
	TodoList:           "todo_list",
	Error:              "error",
}
