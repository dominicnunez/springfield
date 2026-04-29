const EXCEPTION_ENTRY_FORMAT_LINES = [
  "### Plain language description",
  "",
  "**Line:** `line` — optional context",
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
  "**Line:** `line` — optional context",
  "",
  "**Reason:** Why this is a false positive. Can be multiple lines.",
].join("\n");

export const EXCEPTION_REASON_EXAMPLE = [
  "### Plain language description of the finding",
  "",
  "**Line:** `line` — optional context",
  "",
  "**Reason:** Why this is excepted. Can be multiple lines.",
].join("\n");
