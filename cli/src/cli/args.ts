import { statSync } from "node:fs";
import { Command, type OptionValues } from "commander";
import type { Config, EngineType } from "../config/loader.js";
import { VERSION } from "../version.js";
import type { AuditStep } from "./commands/audit.js";
import { applyEngineModelSelection } from "./model-overrides.js";

export type CommandType = "run" | "audit" | "prune";

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
  sourcePath?: string;
  startStep?: AuditStep;
  maxIterations?: number;
  auditPrompt?: string;
  lintCmd?: string;
  engine?: EngineType;
  model?: string;
  verbose?: boolean;
}

export interface PruneCliOptions {
  verbose?: boolean;
}

export interface ParsedArgs {
  command: CommandType;
  options: CliOptions;
  auditOptions: AuditCliOptions;
  pruneOptions: PruneCliOptions;
}

interface EngineOptionValues extends OptionValues {
  engine?: string;
  opencode?: boolean;
  claude?: boolean;
  codex?: boolean;
  model?: string;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function addEngineOptions(command: Command): Command {
  return command
    .option("--engine <type>", "AI engine to use: opencode, claude, or codex")
    .option(
      "--opencode",
      "Use OpenCode engine (shortcut for --engine opencode)",
    )
    .option("--claude", "Use Claude Code engine (shortcut for --engine claude)")
    .option("--codex", "Use Codex CLI engine (shortcut for --engine codex)")
    .option("--model <name>", "Override the model for the selected engine");
}

function resolveSelectedEngine(
  opts: EngineOptionValues,
): EngineType | undefined {
  if (opts.claude) {
    return "claude";
  }

  if (opts.codex) {
    return "codex";
  }

  if (opts.opencode) {
    return "opencode";
  }

  if (
    opts.engine === "claude" ||
    opts.engine === "opencode" ||
    opts.engine === "codex"
  ) {
    return opts.engine;
  }

  return undefined;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const program = new Command();

  let resolvedCommand: CommandType = "run";
  const cliOptions: CliOptions = {};
  const auditCliOptions: AuditCliOptions = {};
  const pruneCliOptions: PruneCliOptions = {};

  program
    .name("sfk")
    .description("Springfield Kit — Autonomous AI development kit")
    .version(VERSION);

  // Default "run" command (also handles bare `sfk "task"` and `sfk`)
  addEngineOptions(program.command("run", { isDefault: true }))
    .description("Run the ralph coding loop (default)")
    .argument("[task]", "Single task to run (non-directory positional)")
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
    .action((task, opts: EngineOptionValues & OptionValues) => {
      resolvedCommand = "run";

      Object.assign(cliOptions, {
        engine: resolveSelectedEngine(opts),
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
  addEngineOptions(program.command("audit"))
    .description("Run the willie audit loop")
    .argument("[source-path]", "Source path to audit; subpaths are included")
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
    .option("--lint-cmd <cmd>", "Custom lint command for fix step")
    .option("-v, --verbose", "Enable verbose output")
    .action(
      (
        sourcePath: string | undefined,
        opts: EngineOptionValues & OptionValues,
      ) => {
        resolvedCommand = "audit";

        const step = opts.step as AuditStep;
        if (step && !["audit", "validate", "fix"].includes(step)) {
          throw new Error(
            `Invalid step: ${step}. Must be audit, validate, or fix.`,
          );
        }

        Object.assign(auditCliOptions, {
          sourcePath,
          startStep: step,
          maxIterations: opts.maxIterations,
          auditPrompt: opts.auditPrompt,
          lintCmd: opts.lintCmd,
          engine: resolveSelectedEngine(opts),
          model: opts.model,
          verbose: opts.verbose,
        });
      },
    );

  program
    .command("prune")
    .description("Remove stale entries from audit/exceptions/ files")
    .option("-v, --verbose", "Enable verbose output")
    .action((opts) => {
      resolvedCommand = "prune";
      Object.assign(pruneCliOptions, {
        verbose: opts.verbose,
      });
    });

  program.parse(argv);

  return {
    command: resolvedCommand,
    options: cliOptions,
    auditOptions: auditCliOptions,
    pruneOptions: pruneCliOptions,
  };
}

/**
 * Merge CLI options with loaded config
 * CLI options take precedence
 */
export function mergeOptions(config: Config, cliOptions: CliOptions): Config {
  const merged = applyEngineModelSelection(config, {
    engine: cliOptions.engine,
    model: cliOptions.model,
  });

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
