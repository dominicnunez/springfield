#!/usr/bin/env node

/**
 * Postinstall script for sfk
 * Creates global config at ~/.config/sfk/config if it doesn't exist
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".config", "sfk");
const CONFIG_FILE = join(CONFIG_DIR, "config");

const DEFAULT_CONFIG = `# SFK Configuration
# Override per-project: .sfk/config

[engine]
type = opencode

[models]
claude = sonnet
effort = high               # global effort default: low|medium|high|xhigh
# Claude supports only low|medium|high and errors on xhigh
opencode-primary = opencode/glm-5-free
# opencode-fallback =

[rate-limits]
soft-retries = 3
soft-wait = 30

[ralph]
max-iterations = 10
sleep-seconds = 2
skip-commit = false
push-after-commit = false
skip-test-verify = false
max-consecutive-failures = 3
# test-cmd =
# model = sonnet
# effort = high             # overrides the global effort for Ralph

[willie]
max-iterations = 0
# audit-prompt = audit-prompt.md
# effort = high             # overrides the global effort for Willie

[logging]
# log-dir = ~/.sfk/logs
# progress-dir = ~/.sfk/progress

[btca]
enabled = false
# resources =
`;

// Only create if doesn't exist (don't overwrite user config)
if (!existsSync(CONFIG_FILE)) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, DEFAULT_CONFIG);
}
