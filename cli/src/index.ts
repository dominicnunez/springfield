#!/usr/bin/env bun
import { mergeOptions, parseArgs } from "./cli/args.js";
import { auditLoop } from "./cli/commands/audit.js";
import { migrateExceptions } from "./cli/commands/migrate.js";
import { pruneExceptions } from "./cli/commands/prune.js";
import { runLoop, runSingleTask } from "./cli/commands/run.js";
import { loadConfig } from "./config/loader.js";
import { logError } from "./ui/logger.js";

async function main(): Promise<void> {
  try {
    const { command, options, auditOptions, pruneOptions } = parseArgs(
      process.argv,
    );
    const config = loadConfig();
    const finalConfig = mergeOptions(config, options);

    if (command === "migrate") {
      migrateExceptions();
      return;
    }

    if (command === "prune") {
      await pruneExceptions(finalConfig, {
        verbose: pruneOptions.verbose,
      });
      return;
    }

    if (command === "audit") {
      const auditConfig = { ...finalConfig };
      if (auditOptions.engine) {
        auditConfig.engine = auditOptions.engine;
      }
      if (auditOptions.model !== undefined) {
        if (auditConfig.engine === "claude") {
          auditConfig.claudeModel = auditOptions.model;
        } else if (auditConfig.engine === "codex") {
          auditConfig.codexModel = auditOptions.model;
        } else {
          auditConfig.ocPrimeModel = auditOptions.model;
        }
      }

      await auditLoop(auditConfig, {
        startStep: auditOptions.startStep ?? "audit",
        maxIterations:
          auditOptions.maxIterations ?? auditConfig.willieMaxIterations,
        auditPromptPath:
          auditOptions.auditPrompt ?? auditConfig.willieAuditPrompt,
        lintCmd: auditOptions.lintCmd,
        verbose: auditOptions.verbose,
      });
      return;
    }

    // Default: run command
    const runOptions = {
      prdPath: options.prd || "PRD.md",
      verbose: options.verbose,
    };

    if (options.singleTask) {
      await runSingleTask(finalConfig, runOptions, options.singleTask);
      return;
    }

    await runLoop(finalConfig, runOptions);
  } catch (error) {
    logError(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    process.exitCode = 1;
  }
}

main();
