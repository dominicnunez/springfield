package engine

type AgentMessageItem struct {
	Text string `json:"text"`
}

type ReasoningItem struct {
	Text string `json:"text"`
}

type CommandExecutionItem struct {
	Command          string               `json:"command"`
	AggregatedOutput string               `json:"aggregated_output"`
	ExitCode         int                  `json:"exit_code"`
	Status           CommandExecutionStatus `json:"status"`
}

type CommandExecutionStatus string

const (
	CommandStatusInProgress CommandExecutionStatus = "in_progress"
	CommandStatusCompleted  CommandExecutionStatus = "completed"
	CommandStatusFailed     CommandExecutionStatus = "failed"
)

type FileChangeItem struct {
	Changes []FileChange   `json:"changes"`
	Status  PatchApplyStatus `json:"status"`
}

type FileChange struct {
	Path string          `json:"path"`
	Kind PatchChangeKind `json:"kind"`
}

type PatchChangeKind string

const (
	PatchChangeAdd    PatchChangeKind = "add"
	PatchChangeDelete PatchChangeKind = "delete"
	PatchChangeUpdate PatchChangeKind = "update"
)

type PatchApplyStatus string

const (
	PatchStatusCompleted PatchApplyStatus = "completed"
	PatchStatusFailed    PatchApplyStatus = "failed"
)

type McpToolCallItem struct {
	Server    string             `json:"server"`
	Tool      string             `json:"tool"`
	Arguments map[string]any     `json:"arguments"`
	Result    *McpToolCallResult `json:"result,omitempty"`
	Error     *McpToolCallError  `json:"error,omitempty"`
	Status    McpToolCallStatus  `json:"status"`
}

type McpToolCallStatus string

const (
	McpStatusInProgress McpToolCallStatus = "in_progress"
	McpStatusCompleted  McpToolCallStatus = "completed"
	McpStatusFailed     McpToolCallStatus = "failed"
)

type McpToolCallResult struct {
	Content           []any `json:"content"`
	StructuredContent any   `json:"structured_content,omitempty"`
}

type McpToolCallError struct {
	Message string `json:"message"`
}

type WebSearchItem struct {
	Query string `json:"query"`
}

type TodoListItem struct {
	Items []TodoItem `json:"items"`
}

type TodoItem struct {
	Text      string `json:"text"`
	Completed bool   `json:"completed"`
}

type ErrorItem struct {
	Message string `json:"message"`
}

type ThreadError struct {
	Message string `json:"message"`
}

type TurnCompletedData struct {
	Usage Usage `json:"usage"`
}

type TurnFailedData struct {
	Error ThreadError `json:"error"`
}

type ThreadStartedData struct {
	ThreadID string `json:"thread_id"`
}

type ItemData struct {
	Item Item `json:"item"`
}

type ErrorEventData struct {
	Message string `json:"message"`
}
