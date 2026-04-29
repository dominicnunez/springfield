#!/usr/bin/env node

/**
 * Postinstall script for sfk
 * Creates global config at ~/.sfk/config if it doesn't exist
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".sfk");
const CONFIG_FILE = join(CONFIG_DIR, "config");

const EXAMPLE_CONFIG = `# SFK Configuration
# Location: ~/.sfk/config
# Uncomment and set every required value before running sfk.

[engine]
# type = opencode

[models]
# claude = sonnet
# codex = gpt-5-codex
# opencode-primary = big-pickle
# opencode-fallback =
# effort = high               # low|medium|high|xhigh
# Claude supports only low|medium|high and errors on xhigh

[rate-limits]
# soft-retries = 3
# soft-wait = 30

[ralph]
# max-iterations = 10
# sleep-seconds = 2
# skip-commit = false
# push-after-commit = false
# skip-test-verify = false
# max-consecutive-failures = 3
# audit-after-complete = false
# test-cmd =
# model = sonnet
# effort = high               # overrides the global effort for Ralph

[willie]
# max-iterations = 0
# audit-prompt = audit/prompt.md
# lint-cmd =
# model = opus
# effort = high               # overrides the global effort for Willie
`;

// Only create if doesn't exist (don't overwrite user config)
if (!existsSync(CONFIG_FILE)) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, EXAMPLE_CONFIG);
}
