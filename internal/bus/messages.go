package bus

const (
	TopicRalphCompleted     = "ralph.completed"
	TopicVerificationPassed  = "verification.passed"
	TopicVerificationFailed  = "verification.failed"
	TopicAuditComplete       = "audit.complete"
	TopicLoopComplete        = "loop.complete"
	TopicLisaEscalation      = "lisa.escalation"
	TopicRalphKickback       = "ralph.kickback"
	TopicMaxKickbacksReached = "max.kickbacks.reached"
)

type RalphCompletedPayload struct {
	ThreadID     string
	FilesChanged []string
	Success      bool
}

type VerificationPassedPayload struct {
	ThreadID    string
	TestOutput  string
	TestsPassed bool
	ACPassed    bool
}

type VerificationFailedPayload struct {
	ThreadID     string
	TestOutput   string
	FailedTests  []string
	FailedAC     []string
	ErrorDetails string
}

type AuditCompletePayload struct {
	ThreadID   string
	Findings   []AuditFinding
	HasIssues  bool
}

type AuditFinding struct {
	Severity string
	File     string
	Line     int
	Message  string
}

type LisaEscalationPayload struct {
	Reason string
	From   string
}

type RalphKickbackPayload struct {
	Attempt      int
	MaxAttempts  int
	ErrorMessage string
}

type MaxKickbacksReachedPayload struct {
	TaskName     string
	ErrorMessage string
}
