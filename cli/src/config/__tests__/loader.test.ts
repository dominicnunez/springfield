import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "../loader.js";
import {
  applyConfigToConfig,
  getCurrentModel,
  getRalphEffort,
  getRalphModel,
  getWillieEffort,
  getWillieModel,
  parseConfigFile,
} from "../loader.js";

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    engine: "opencode",
    claudeModel: "sonnet",
    claudeEffort: "high",
    ocPrimeModel: "big-pickle",
    ocFallModel: undefined,
    softLimitRetries: 3,
    softLimitWait: 30,
    maxIterations: 10,
    sleepSeconds: 2,
    skipCommit: false,
    pushAfterCommit: false,
    skipTestVerify: false,
    maxConsecutiveFailures: 3,
    testCmd: undefined,
    ralphModel: undefined,
    ralphEffort: undefined,
    willieMaxIterations: 0,
    willieAuditPrompt: undefined,
    willieModel: undefined,
    willieEffort: undefined,
    logDir: join(homedir(), ".sfk", "logs"),
    progressDir: join(homedir(), ".sfk", "progress"),
    auditAfterComplete: false,
    ...overrides,
  };
}

describe("config/loader", () => {
  describe("parseConfigFile", () => {
    test("parses section headers and key-value pairs", () => {
      const result = parseConfigFile(`
[engine]
type = claude

[ralph]
max-iterations = 25
`);
      expect(result["engine.type"]).toBe("claude");
      expect(result["ralph.max-iterations"]).toBe("25");
    });

    test("ignores comments and empty lines", () => {
      const result = parseConfigFile(`
# This is a comment
[engine]
# type = opencode
type = claude

`);
      expect(result["engine.type"]).toBe("claude");
      expect(Object.keys(result).length).toBe(1);
    });

    test("handles double-quoted values", () => {
      const result = parseConfigFile(`
[ralph]
test-cmd = "npm run test:ci"
`);
      expect(result["ralph.test-cmd"]).toBe("npm run test:ci");
    });

    test("handles single-quoted values", () => {
      const result = parseConfigFile(`
[ralph]
test-cmd = 'bun test'
`);
      expect(result["ralph.test-cmd"]).toBe("bun test");
    });

    test("handles values with equals signs", () => {
      const result = parseConfigFile(`
[ralph]
test-cmd = KEY=VAL bun test
`);
      expect(result["ralph.test-cmd"]).toBe("KEY=VAL bun test");
    });

    test("handles keys without a section", () => {
      const result = parseConfigFile(`
standalone = value
`);
      expect(result.standalone).toBe("value");
    });

    test("trims whitespace around keys and values", () => {
      const result = parseConfigFile(`
[engine]
  type  =  opencode
`);
      expect(result["engine.type"]).toBe("opencode");
    });

    test("parses all config sections", () => {
      const result = parseConfigFile(`
[engine]
type = claude

[models]
claude = opus
claude-effort = medium
opencode-primary = gpt-5
opencode-fallback = gpt-4

[rate-limits]
soft-retries = 7
soft-wait = 60

[ralph]
max-iterations = 25
sleep-seconds = 5
skip-commit = true
push-after-commit = true
skip-test-verify = false
max-consecutive-failures = 5
test-cmd = bun test
model = haiku
effort = low
audit-after-complete = true

[willie]
max-iterations = 3
audit-prompt = audit/prompt.md
model = opus
effort = high

[logging]
log-dir = /tmp/logs
progress-dir = /tmp/progress
`);

      expect(result["engine.type"]).toBe("claude");
      expect(result["models.claude"]).toBe("opus");
      expect(result["models.claude-effort"]).toBe("medium");
      expect(result["models.opencode-primary"]).toBe("gpt-5");
      expect(result["models.opencode-fallback"]).toBe("gpt-4");
      expect(result["rate-limits.soft-retries"]).toBe("7");
      expect(result["rate-limits.soft-wait"]).toBe("60");
      expect(result["ralph.max-iterations"]).toBe("25");
      expect(result["ralph.sleep-seconds"]).toBe("5");
      expect(result["ralph.skip-commit"]).toBe("true");
      expect(result["ralph.push-after-commit"]).toBe("true");
      expect(result["ralph.skip-test-verify"]).toBe("false");
      expect(result["ralph.max-consecutive-failures"]).toBe("5");
      expect(result["ralph.test-cmd"]).toBe("bun test");
      expect(result["ralph.model"]).toBe("haiku");
      expect(result["ralph.effort"]).toBe("low");
      expect(result["ralph.audit-after-complete"]).toBe("true");
      expect(result["willie.max-iterations"]).toBe("3");
      expect(result["willie.audit-prompt"]).toBe("audit/prompt.md");
      expect(result["willie.model"]).toBe("opus");
      expect(result["willie.effort"]).toBe("high");
      expect(result["logging.log-dir"]).toBe("/tmp/logs");
      expect(result["logging.progress-dir"]).toBe("/tmp/progress");
    });
  });

  describe("applyConfigToConfig", () => {
    test("applies engine type", () => {
      const config = baseConfig();
      applyConfigToConfig(config, { "engine.type": "claude" });
      expect(config.engine).toBe("claude");
    });

    test("ignores invalid engine type", () => {
      const config = baseConfig();
      applyConfigToConfig(config, { "engine.type": "invalid" });
      expect(config.engine).toBe("opencode");
    });

    test("applies model settings", () => {
      const config = baseConfig();
      applyConfigToConfig(config, {
        "models.claude": "opus",
        "models.claude-effort": "medium",
        "models.opencode-primary": "gpt-5",
        "models.opencode-fallback": "gpt-4",
      });
      expect(config.claudeModel).toBe("opus");
      expect(config.claudeEffort).toBe("medium");
      expect(config.ocPrimeModel).toBe("gpt-5");
      expect(config.ocFallModel).toBe("gpt-4");
    });

    test("ignores invalid effort level", () => {
      const config = baseConfig();
      applyConfigToConfig(config, { "models.claude-effort": "turbo" });
      expect(config.claudeEffort).toBe("high"); // unchanged
    });

    test("applies rate limit settings", () => {
      const config = baseConfig();
      applyConfigToConfig(config, {
        "rate-limits.soft-retries": "7",
        "rate-limits.soft-wait": "60",
      });
      expect(config.softLimitRetries).toBe(7);
      expect(config.softLimitWait).toBe(60);
    });

    test("applies ralph settings", () => {
      const config = baseConfig();
      applyConfigToConfig(config, {
        "ralph.max-iterations": "25",
        "ralph.sleep-seconds": "5",
        "ralph.skip-commit": "true",
        "ralph.push-after-commit": "true",
        "ralph.skip-test-verify": "true",
        "ralph.max-consecutive-failures": "5",
        "ralph.test-cmd": "bun test",
        "ralph.model": "haiku",
        "ralph.effort": "low",
        "ralph.audit-after-complete": "true",
      });
      expect(config.maxIterations).toBe(25);
      expect(config.sleepSeconds).toBe(5);
      expect(config.skipCommit).toBe(true);
      expect(config.pushAfterCommit).toBe(true);
      expect(config.skipTestVerify).toBe(true);
      expect(config.maxConsecutiveFailures).toBe(5);
      expect(config.testCmd).toBe("bun test");
      expect(config.ralphModel).toBe("haiku");
      expect(config.ralphEffort).toBe("low");
      expect(config.auditAfterComplete).toBe(true);
    });

    test("applies willie settings", () => {
      const config = baseConfig();
      applyConfigToConfig(config, {
        "willie.max-iterations": "3",
        "willie.audit-prompt": "audit/prompt.md",
        "willie.model": "opus",
        "willie.effort": "medium",
      });
      expect(config.willieMaxIterations).toBe(3);
      expect(config.willieAuditPrompt).toBe("audit/prompt.md");
      expect(config.willieModel).toBe("opus");
      expect(config.willieEffort).toBe("medium");
    });

    test("applies logging settings", () => {
      const config = baseConfig();
      applyConfigToConfig(config, {
        "logging.log-dir": "/tmp/logs",
        "logging.progress-dir": "/tmp/progress",
      });
      expect(config.logDir).toBe("/tmp/logs");
      expect(config.progressDir).toBe("/tmp/progress");
    });

    test("later apply overrides earlier values", () => {
      const config = baseConfig();

      // Simulate global config
      applyConfigToConfig(config, {
        "engine.type": "opencode",
        "ralph.max-iterations": "100",
      });

      // Simulate project config override
      applyConfigToConfig(config, {
        "engine.type": "claude",
        "ralph.max-iterations": "3",
      });

      expect(config.engine).toBe("claude");
      expect(config.maxIterations).toBe(3);
    });

    test("ignores empty test-cmd", () => {
      const config = baseConfig();
      applyConfigToConfig(config, { "ralph.test-cmd": "  " });
      expect(config.testCmd).toBeUndefined();
    });

    test("ignores empty opencode-fallback", () => {
      const config = baseConfig();
      applyConfigToConfig(config, { "models.opencode-fallback": "  " });
      expect(config.ocFallModel).toBeUndefined();
    });
  });

  describe("model helpers", () => {
    test("getCurrentModel returns claude model when engine is claude", () => {
      expect(
        getCurrentModel(baseConfig({ engine: "claude", claudeModel: "opus" })),
      ).toBe("opus");
    });

    test("getCurrentModel returns opencode model when engine is opencode", () => {
      expect(
        getCurrentModel(
          baseConfig({ engine: "opencode", ocPrimeModel: "gpt-5" }),
        ),
      ).toBe("gpt-5");
    });

    test("getRalphModel uses per-agent override for claude", () => {
      expect(
        getRalphModel(
          baseConfig({
            engine: "claude",
            claudeModel: "sonnet",
            ralphModel: "opus",
          }),
        ),
      ).toBe("opus");
    });

    test("getRalphModel falls back to global claude model", () => {
      expect(
        getRalphModel(baseConfig({ engine: "claude", claudeModel: "sonnet" })),
      ).toBe("sonnet");
    });

    test("getRalphModel returns opencode model regardless of ralphModel", () => {
      expect(
        getRalphModel(
          baseConfig({
            engine: "opencode",
            ocPrimeModel: "gpt-5",
            ralphModel: "opus",
          }),
        ),
      ).toBe("gpt-5");
    });

    test("getRalphEffort uses per-agent override", () => {
      expect(
        getRalphEffort(
          baseConfig({ claudeEffort: "high", ralphEffort: "low" }),
        ),
      ).toBe("low");
    });

    test("getRalphEffort falls back to global effort", () => {
      expect(getRalphEffort(baseConfig({ claudeEffort: "medium" }))).toBe(
        "medium",
      );
    });

    test("getWillieModel uses per-agent override", () => {
      expect(getWillieModel(baseConfig({ willieModel: "sonnet" }))).toBe(
        "sonnet",
      );
    });

    test("getWillieModel defaults to engine's primary model (opencode)", () => {
      expect(getWillieModel(baseConfig())).toBe("big-pickle");
    });

    test("getWillieModel defaults to engine's primary model (claude)", () => {
      expect(
        getWillieModel(baseConfig({ engine: "claude", claudeModel: "sonnet" })),
      ).toBe("sonnet");
    });

    test("getWillieEffort uses per-agent override", () => {
      expect(getWillieEffort(baseConfig({ willieEffort: "low" }))).toBe("low");
    });

    test("getWillieEffort falls back to global effort", () => {
      expect(getWillieEffort(baseConfig({ claudeEffort: "medium" }))).toBe(
        "medium",
      );
    });
  });
});
