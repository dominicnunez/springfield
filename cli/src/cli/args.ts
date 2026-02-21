import { statSync } from "node:fs";
import { Command } from "commander";
import type { Config, EngineType } from "../config/loader.js";
import { VERSION } from "../version.js";
import type { AuditStep } from "./commands/audit.js";

export type CommandType = "run" | "audit";

export interface CliOptions {
  engine?: EngineType;
  model?: string;
  maxIterations?: number;
  sleepSeconds?: number;
  skipCommit?: boolean;
  skipTestVerify?: boolean;
  testCmd?: string;
  prd?: string;
  verbose?: boolean;
  singleTask?: string;
  auditAfter?: boolean;
}

export interface AuditCliOptions {
  startStep?: AuditStep;
  maxIterations?: number;
  auditPrompt?: string;
  verbose?: boolean;
}

export interface ParsedArgs {
  command: CommandType;
  options: CliOptions;
  auditOptions: AuditCliOptions;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const program = new Command();

  let resolvedCommand: CommandType = "run";
  const cliOptions: CliOptions = {};
  const auditCliOptions: AuditCliOptions = {};

  program
    .name("sfk")
    .description("Springfield Kit — Autonomous AI development kit")
    .version(VERSION);

  // Default "run" command (also handles bare `sfk "task"` and `sfk`)
  program
    .command("run", { isDefault: true })
    .description("Run the ralph coding loop (default)")
    .argument("[task]", "Single task to run (non-directory positional)")
    .option("--engine <type>", "AI engine to use: opencode or claude")
    .option(
      "--opencode",
      "Use OpenCode engine (shortcut for --engine opencode)",
    )
    .option("--claude", "Use Claude Code engine (shortcut for --engine claude)")
    .option("--model <name>", "Override the model for the selected engine")
    .option(
      "--max-iterations <n>",
      "Maximum iterations (-1 for infinite)",
      parseInt,
    )
    .option(
      "--sleep <seconds>",
      "Seconds to sleep between iterations",
      parseInt,
    )
    .option("--skip-commit", "Do not auto-commit changes")
    .option("--no-tests", "Skip test verification (not recommended)")
    .option("--test-cmd <cmd>", "Custom test command")
    .option("--prd <path>", "Path to PRD.md file")
    .option("--audit-after", "Run willie audit after all PRD tasks complete")
    .option("-v, --verbose", "Enable verbose output")
    .action((task, opts) => {
      resolvedCommand = "run";

      let engine: EngineType | undefined;
      if (opts.claude) {
        engine = "claude";
      } else if (opts.opencode) {
        engine = "opencode";
      } else if (opts.engine === "claude" || opts.engine === "opencode") {
        engine = opts.engine;
      }

      Object.assign(cliOptions, {
        engine,
        model: opts.model,
        maxIterations: opts.maxIterations,
        sleepSeconds: opts.sleep,
        skipCommit: opts.skipCommit,
        skipTestVerify: opts.tests === false,
        testCmd: opts.testCmd,
        prd: opts.prd,
        verbose: opts.verbose,
        auditAfter: opts.auditAfter,
        singleTask: task && !isDirectory(task) ? task : undefined,
      });
    });

  // Audit command
  program
    .command("audit")
    .description("Run the willie audit loop")
    .option(
      "--step <step>",
      "Start from step: audit, validate, or fix",
      "audit",
    )
    .option(
      "--max-iterations <n>",
      "Maximum audit iterations (0 = unlimited)",
      parseInt,
    )
    .option("--audit-prompt <path>", "Path to custom audit prompt file")
    .option("-v, --verbose", "Enable verbose output")
    .action((opts) => {
      resolvedCommand = "audit";

      const step = opts.step as AuditStep;
      if (step && !["audit", "validate", "fix"].includes(step)) {
        throw new Error(
          `Invalid step: ${step}. Must be audit, validate, or fix.`,
        );
      }

      Object.assign(auditCliOptions, {
        startStep: step,
        maxIterations: opts.maxIterations,
        auditPrompt: opts.auditPrompt,
        verbose: opts.verbose,
      });
    });

  program.parse(argv);

  return {
    command: resolvedCommand,
    options: cliOptions,
    auditOptions: auditCliOptions,
  };
}

/**
 * Merge CLI options with loaded config
 * CLI options take precedence
 */
export function mergeOptions(config: Config, cliOptions: CliOptions): Config {
  const merged = { ...config };

  if (cliOptions.engine) {
    merged.engine = cliOptions.engine;
  }

  if (cliOptions.model !== undefined) {
    if (merged.engine === "claude") {
      merged.claudeModel = cliOptions.model;
    } else {
      merged.ocPrimeModel = cliOptions.model;
    }
  }

  if (cliOptions.maxIterations !== undefined) {
    if (cliOptions.maxIterations < -1) {
      cliOptions.maxIterations = -1;
    }
    merged.maxIterations = cliOptions.maxIterations;
  }

  if (cliOptions.sleepSeconds !== undefined) {
    if (cliOptions.sleepSeconds < 0) {
      cliOptions.sleepSeconds = 0;
    }
    merged.sleepSeconds = cliOptions.sleepSeconds;
  }

  if (cliOptions.skipCommit !== undefined) {
    merged.skipCommit = cliOptions.skipCommit;
  }

  if (cliOptions.skipTestVerify !== undefined) {
    merged.skipTestVerify = cliOptions.skipTestVerify;
  }

  if (cliOptions.testCmd) {
    merged.testCmd = cliOptions.testCmd;
  }

  if (cliOptions.auditAfter) {
    merged.auditAfterComplete = true;
  }

  return merged;
}
