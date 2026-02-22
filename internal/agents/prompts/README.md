# Agent Prompts

This directory contains prompt templates for each agent.

## Structure

```
prompts/
├── lisa/
│   ├── plan.md
│   └── interactive.md
├── frank/
│   └── spec.md
├── ralph/
│   ├── implement.md
│   └── fix-tests.md
├── skinner/
│   └── verify.md
└── martin/
    └── audit.md
```

## Template Format

Templates use Go's `text/template` syntax with the following available variables:

- `.Task` - Current task description
- .PRD` - Full PRD content
- `.Spec` - Technical specification (for Ralph)
- `.TestOutput` - Test output (for Skinner/Ralph fix)
- `.FilesChanged` - List of changed files
- `.PreviousFindings` - Previous audit findings (for Martin)
