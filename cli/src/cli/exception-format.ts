const EXCEPTION_ENTRY_FORMAT_LINES = [
  "### Plain language description",
  "",
  "**Location:** `file/path:line` — optional context",
  "",
  "**Reason:** Explanation (can be multiple lines)",
];

export const EXCEPTION_ENTRY_EXAMPLE = EXCEPTION_ENTRY_FORMAT_LINES.join("\n");

export const EXCEPTION_ENTRY_FORMAT_BLOCKQUOTE = [
  "> Entry format:",
  ...EXCEPTION_ENTRY_FORMAT_LINES.map((line) => `> ${line}`),
].join("\n");

export const EXCEPTION_FALSE_POSITIVE_EXAMPLE = [
  "### Plain language description of the finding",
  "",
  "**Location:** `file/path:line` — optional context",
  "",
  "**Reason:** Why this is a false positive. Can be multiple lines.",
].join("\n");

export const EXCEPTION_REASON_EXAMPLE = [
  "### Plain language description of the finding",
  "",
  "**Location:** `file/path:line` — optional context",
  "",
  "**Reason:** Why this is excepted. Can be multiple lines.",
].join("\n");

export const EXCEPTION_FILE_DESCRIPTIONS = {
  "risks.md":
    "finding is real but not reasonably remediable in this repo because of upstream constraints, architecture cost, or a defensible design tradeoff",
  "misreads.md":
    "finding was factually wrong (should have been caught in validate step)",
  "design.md": "finding describes behavior that is correct by design",
} as const;

export const EXCEPTION_FILE_TEMPLATES = {
  "misreads.md": `# Misreads

> Findings where the audit misread the code or described behavior that doesn't occur.
> Managed by sfk willie. Follow the entry format below.
${EXCEPTION_ENTRY_FORMAT_BLOCKQUOTE}
`,
  "risks.md": `# Risks

> Real findings consciously accepted — architectural cost, external constraints, disproportionate effort.
> Not for deferred cleanup, "fix later", repo-local test improvements, or any finding with a straightforward remediation path in this codebase.
> Managed by sfk willie. Follow the entry format below.
${EXCEPTION_ENTRY_FORMAT_BLOCKQUOTE}
`,
  "design.md": `# Design

> Findings that describe behavior which is correct by design.
> Managed by sfk willie. Follow the entry format below.
${EXCEPTION_ENTRY_FORMAT_BLOCKQUOTE}
`,
} as const;
