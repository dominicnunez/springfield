import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import pc from "picocolors";
import type { Config } from "../../config/loader.js";
import {
  getCurrentModel,
  getRalphEffort,
  getRalphModel,
} from "../../config/loader.js";
import {
  COMPLETE_MARKER,
  type Engine,
  generateFixTestsPrompt,
  generatePrompt,
  generateSingleTaskPrompt,
} from "../../engines/base.js";
import { ClaudeEngine } from "../../engines/claude.js";
import { OpenCodeEngine } from "../../engines/opencode.js";
import {
  allTasksComplete,
  countIncompleteTasks,
  getFirstIncompleteTask,
  parsePrd,
} from "../../tasks/parser.js";
import {
  appendFailure,
  getProgressFile,
  initProgress,
} from "../../tasks/progress.js";
import { detectTestCommand, verify } from "../../tasks/verification.js";
import {
  initLogger,
  logAiOutput,
  logDebug,
  logError,
  logInfo,
  logIteration,
  logSessionStart,
  logSuccess,
  logWarning,
} from "../../ui/logger.js";

const EXPONENTIAL_BACKOFF_MULTIPLIER = 2;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function handleSoftRateLimit(
  attempt: number,
  maxRetries: number,
  baseWait: number,
): Promise<boolean> {
  if (attempt >= maxRetries) {
    logWarning(`Soft rate limit: exhausted ${maxRetries} retries`);
    console.log(`  Soft rate limit persisted after ${maxRetries} retries`);
    return false;
  }

  const waitTime = baseWait * EXPONENTIAL_BACKOFF_MULTIPLIER ** attempt;

  console.log("");
  console.log(
    "───────────────────────────────────────────────────────────────",
  );
  console.log(
    `  Soft rate limit detected (attempt ${attempt + 1}/${maxRetries})`,
  );
  console.log(`  Waiting ${waitTime}s before retry...`);
  console.log(
    "───────────────────────────────────────────────────────────────",
  );
  logInfo(
    `Soft rate limit: waiting ${waitTime}s (attempt ${attempt + 1}/${maxRetries})`,
  );

  await sleep(waitTime);
  return true;
}

function notify(message: string): void {
  try {
    const result = spawnSync("which", ["openclaw"], { encoding: "utf-8" });
    if (result.status === 0) {
      spawnSync("openclaw", ["cron", "wake", message], {
        encoding: "utf-8",
        stdio: "ignore",
      });
    }
  } catch (err) {
    logDebug(`Notification failed: ${err}`);
  }
}

function pushAfterCommit(headBefore: string): void {
  const headAfter = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf-8",
  }).stdout.trim();

  if (!headBefore || headBefore === headAfter) return;

  logInfo("New commit detected, pushing to origin");
  console.log("  Pushing changes to origin...");

  const branchResult = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf-8",
  });
  const branch = branchResult.stdout.trim();

  if (!branch || branchResult.status !== 0) {
    logWarning("Failed to detect current branch, skipping push");
    console.log("  Failed to detect branch (will retry next iteration)");
    return;
  }

  // Check if branch has upstream
  const hasUpstream = spawnSync(
    "git",
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
  );

  const pushArgs =
    hasUpstream.status === 0 ? ["push"] : ["push", "-u", "origin", branch];

  const pushResult = spawnSync("git", pushArgs, {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (pushResult.status === 0) {
    logInfo("Push successful");
    console.log(`  Pushed to origin/${branch}`);
  } else {
    logWarning(
      `Push failed: ${pushResult.stderr || "unknown error"} (will retry next iteration)`,
    );
    console.log("  Push failed (will retry next iteration)");
  }
}

function getHeadSha(): string | null {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim();
}

// ─────────────────────────────────────────────────────────────
// Engine factory
// ─────────────────────────────────────────────────────────────

function createEngine(config: Config): Engine {
  if (config.engine === "claude") {
    return new ClaudeEngine(getRalphModel(config), getRalphEffort(config));
  }
  return new OpenCodeEngine(config.ocPrimeModel, config.ocFallModel);
}

// ─────────────────────────────────────────────────────────────
// Run loop
// ─────────────────────────────────────────────────────────────

export interface RunOptions {
  prdPath: string;
  verbose?: boolean;
}

export async function runLoop(
  config: Config,
  options: RunOptions,
): Promise<void> {
  const projectName = basename(process.cwd());
  const logFile = join(config.logDir, `ralph-${projectName}.log`);
  const progressFile = getProgressFile(projectName, config.progressDir);

  initLogger({ logFile, verbose: options.verbose });
  initProgress(config.progressDir, progressFile);

  const engine = createEngine(config);

  if (!engine.isAvailable()) {
    logError(
      `'${engine.name}' command not found. Please install ${engine.name === "claude" ? "Claude CLI" : "OpenCode CLI"}.`,
    );
    process.exit(1);
  }

  const testCmd = config.testCmd || detectTestCommand();

  logSessionStart(projectName, config.engine, getCurrentModel(config));

  if (config.maxIterations < -1) {
    logWarning("Invalid maxIterations value, defaulting to 10");
    config.maxIterations = 10;
  }

  const iterStr =
    config.maxIterations === -1
      ? "Infinite mode"
      : `Max ${config.maxIterations} iterations`;
  console.log(`Starting Ralph (${config.engine}) - ${iterStr}`);
  console.log(`Using model: ${getCurrentModel(config)}`);

  if (config.engine === "opencode" && config.ocFallModel) {
    console.log(`Fallback model: ${config.ocFallModel}`);
  }

  if (config.skipCommit) {
    console.log("Commits disabled for this run");
  }

  if (config.skipTestVerify) {
    console.log(pc.yellow("  Test verification DISABLED"));
    logWarning("Test verification disabled");
  } else if (testCmd) {
    console.log(`  Test command: ${testCmd}`);
    logInfo(`Test command: ${testCmd}`);
  } else {
    console.log(
      pc.yellow(
        "  No test command detected (configure test-cmd in .sfk/config)",
      ),
    );
    logWarning("No test command detected");
  }

  console.log(`  Log file: ${logFile}`);
  console.log("");

  const prompt = generatePrompt({
    skipCommit: config.skipCommit,
    progressFile,
  });

  // Signal handling
  let interrupted = false;
  const signalHandler = (signal: string) => {
    logWarning(`Received signal: ${signal}`);
    interrupted = true;
  };
  process.on("SIGINT", () => signalHandler("SIGINT"));
  process.on("SIGTERM", () => signalHandler("SIGTERM"));

  let iteration = 0;
  let consecutiveFailures = 0;
  let softLimitRetries = 0;
  let lastFailedTask = "";
  let testFailureMode = false;
  let lastTestOutput = "";

  while (config.maxIterations === -1 || iteration < config.maxIterations) {
    if (interrupted) {
      logWarning(`Interrupted at iteration ${iteration}`);
      console.log(pc.yellow("\n  Interrupted. Exiting gracefully."));
      process.exit(130);
    }

    iteration++;

    // Check PRD exists
    if (!existsSync(options.prdPath)) {
      logWarning(`${options.prdPath} not found, exiting`);
      console.log(pc.yellow(`  ${options.prdPath} not found. Exiting.`));
      process.exit(1);
    }

    const tasks = parsePrd(options.prdPath);
    const currentTask = getFirstIncompleteTask(tasks);
    const taskName = currentTask?.text || "unknown";

    if (allTasksComplete(tasks) && tasks.length > 0) {
      logSuccess("All tasks already complete!");
      console.log(pc.green("==========================================="));
      console.log(pc.green("  All tasks already complete!"));
      console.log(pc.green("==========================================="));

      try {
        unlinkSync(options.prdPath);
      } catch (err) {
        logWarning(`Failed to delete PRD file: ${err}`);
      }
      notify(`Ralph finished ${projectName} — all tasks already complete.`);
      process.exit(0);
    }

    // Save HEAD before iteration for push detection
    const headBefore = getHeadSha();

    logIteration(iteration, config.maxIterations, taskName, engine.model);
    if (testFailureMode) {
      console.log(pc.yellow("  Mode: FIX TESTS"));
    }

    const currentPrompt =
      testFailureMode && lastTestOutput
        ? generateFixTestsPrompt({
            testOutput: lastTestOutput,
            skipCommit: config.skipCommit,
            progressFile,
          })
        : prompt;

    const result = await engine.run(currentPrompt);
    logAiOutput(result.output);
    console.log("");

    // Rate limit handling (OpenCode only)
    if (config.engine === "opencode") {
      if (result.hardRateLimited) {
        logWarning("Hard rate limit detected (quota/billing)");
        console.log("  Hard rate limit: quota or billing issue");
        softLimitRetries = 0;

        if (engine.switchToFallback?.()) {
          iteration--;
          continue;
        } else {
          logError("Hard rate limit and no fallback available");
          console.log("  Hard rate limit and no fallback available");
          process.exit(1);
        }
      }

      if (result.softRateLimited) {
        logWarning("Soft rate limit detected (temporary cooldown)");

        if (
          await handleSoftRateLimit(
            softLimitRetries,
            config.softLimitRetries,
            config.softLimitWait,
          )
        ) {
          softLimitRetries++;
          iteration--;
          continue;
        } else {
          softLimitRetries = 0;
          if (engine.switchToFallback?.()) {
            iteration--;
            continue;
          } else {
            logError("Soft rate limit persisted, no fallback available");
            console.log(
              "  Rate limit persisted after retries, no fallback available",
            );
            process.exit(1);
          }
        }
      }

      softLimitRetries = 0;
    }

    if (!result.success) {
      logError(`${engine.name} failed with exit code ${result.exitCode}`);
      process.exit(result.exitCode);
    }

    // Test verification gate
    if (!config.skipTestVerify && testCmd) {
      const verification = verify(testCmd);

      if (!verification.testsWritten) {
        if (taskName !== lastFailedTask) {
          consecutiveFailures = 1;
          lastFailedTask = taskName;
          logInfo("Task changed, resetting failure counter");
        } else {
          consecutiveFailures++;
        }

        logWarning(
          `No tests written, iteration failed (${consecutiveFailures}/${config.maxConsecutiveFailures})`,
        );

        appendFailure(
          progressFile,
          iteration,
          "No test files were created or modified",
          "You MUST write tests before the task can be completed",
        );

        if (consecutiveFailures >= config.maxConsecutiveFailures) {
          logError(
            `Too many consecutive failures on task '${taskName}', stopping`,
          );
          console.log(pc.red("  Too many consecutive failures on this task"));
          console.log(pc.red("  Manual intervention required"));
          console.log(`  Check log: ${logFile}`);
          process.exit(1);
        }

        console.log(
          `  Verification failed (${consecutiveFailures}/${config.maxConsecutiveFailures})`,
        );
        console.log("  Continuing to next iteration to fix...");
        await sleep(config.sleepSeconds);
        continue;
      }

      if (!verification.testsPassed) {
        if (taskName !== lastFailedTask) {
          consecutiveFailures = 1;
          lastFailedTask = taskName;
          logInfo("Task changed, resetting failure counter");
        } else {
          consecutiveFailures++;
        }

        logWarning(
          `Tests failed, iteration failed (${consecutiveFailures}/${config.maxConsecutiveFailures})`,
        );

        testFailureMode = true;
        lastTestOutput = verification.testOutput || "";

        appendFailure(
          progressFile,
          iteration,
          "Tests failed",
          "Fix the failing tests before marking the task complete",
          verification.testOutput,
        );

        if (consecutiveFailures >= config.maxConsecutiveFailures) {
          logError(
            `Too many consecutive failures on task '${taskName}', stopping`,
          );
          console.log(pc.red("  Too many consecutive failures on this task"));
          console.log(pc.red("  Manual intervention required"));
          console.log(`  Check log: ${logFile}`);
          process.exit(1);
        }

        console.log(
          `  Verification failed (${consecutiveFailures}/${config.maxConsecutiveFailures})`,
        );
        console.log("  Continuing to next iteration to fix...");
        console.log(
          pc.yellow(
            "  Next iteration will use fix-tests prompt with test output",
          ),
        );
        await sleep(config.sleepSeconds);
        continue;
      }

      consecutiveFailures = 0;
      lastFailedTask = "";
      testFailureMode = false;
      lastTestOutput = "";
      logInfo("Verification passed");
    }

    // Push after commit
    if (config.pushAfterCommit && !config.skipCommit && headBefore) {
      pushAfterCommit(headBefore);
    }

    // Completion check
    if (result.output.includes(COMPLETE_MARKER)) {
      const finalTasks = parsePrd(options.prdPath);
      const remainingCount = countIncompleteTasks(finalTasks);

      if (remainingCount > 0) {
        logWarning(`AI claimed complete but ${remainingCount} tasks remain`);
        console.log("");
        console.log(pc.yellow("==========================================="));
        console.log(
          pc.yellow(`  AI claimed complete but ${remainingCount} tasks remain`),
        );
        console.log(pc.yellow("  Continuing to next iteration..."));
        console.log(pc.yellow("==========================================="));
        await sleep(config.sleepSeconds);
        continue;
      }

      // Final test run
      if (!config.skipTestVerify && testCmd) {
        console.log("");
        console.log("  Final verification: running full test suite...");
        const finalVerification = verify(testCmd);

        if (!finalVerification.testsPassed) {
          logError("Final verification failed");
          console.log("");
          console.log(pc.red("==========================================="));
          console.log(pc.red("  Final tests failed!"));
          console.log(pc.red("  Continuing to fix..."));
          console.log(pc.red("==========================================="));
          await sleep(config.sleepSeconds);
          continue;
        }
      }

      // Success!
      logSuccess("All tasks completed successfully!");
      console.log(pc.green("==========================================="));
      console.log(
        pc.green(`  All tasks complete after ${iteration} iterations!`),
      );
      console.log(pc.green("  All tests passing!"));
      console.log(`  Log: ${logFile}`);
      console.log(pc.green("==========================================="));

      try {
        unlinkSync(options.prdPath);
      } catch (err) {
        logWarning(`Failed to delete PRD file: ${err}`);
      }
      notify(
        `Ralph finished ${projectName} — all tasks complete after ${iteration} iterations. All tests passing.`,
      );

      // Chain to willie audit if configured
      if (config.auditAfterComplete) {
        console.log("");
        console.log(pc.cyan("  Starting willie audit loop..."));
        // Dynamic import to avoid circular dependency at module load
        const { auditLoop } = await import("./audit.js");
        await auditLoop(config, {
          startStep: "audit",
          maxIterations: config.willieMaxIterations,
          auditPromptPath: config.willieAuditPrompt,
          verbose: options.verbose,
        });
      }

      process.exit(0);
    }

    await sleep(config.sleepSeconds);
  }

  // Max iterations reached
  logWarning(`Reached max iterations (${config.maxIterations})`);
  console.log(pc.yellow("==========================================="));
  console.log(pc.yellow(`  Reached max iterations (${config.maxIterations})`));
  console.log(`  Log: ${logFile}`);
  console.log(pc.yellow("==========================================="));

  notify(
    `Ralph hit max iterations (${config.maxIterations}) on ${projectName} — tasks remain incomplete.`,
  );

  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// Single task mode
// ─────────────────────────────────────────────────────────────

export async function runSingleTask(
  config: Config,
  options: RunOptions,
  task: string,
  engineOverride?: Engine,
): Promise<void> {
  const projectName = basename(process.cwd());
  const logFile = join(config.logDir, `ralph-${projectName}.log`);
  const progressFile = getProgressFile(projectName, config.progressDir);

  initLogger({ logFile, verbose: options.verbose });
  initProgress(config.progressDir, progressFile);

  const engine: Engine = engineOverride ?? createEngine(config);

  if (!engine.isAvailable()) {
    logError(
      `'${engine.name}' command not found. Please install ${engine.name === "claude" ? "Claude CLI" : "OpenCode CLI"}.`,
    );
    process.exit(1);
  }

  const testCmd = config.testCmd || detectTestCommand();

  logSessionStart(projectName, config.engine, getCurrentModel(config));

  console.log(`Starting Ralph (${config.engine}) - Single task mode`);
  console.log(`Using model: ${getCurrentModel(config)}`);

  if (config.engine === "opencode" && config.ocFallModel) {
    console.log(`Fallback model: ${config.ocFallModel}`);
  }

  if (config.skipCommit) {
    console.log("Commits disabled for this run");
  }

  if (config.skipTestVerify) {
    console.log(pc.yellow("  Test verification DISABLED"));
    logWarning("Test verification disabled");
  } else if (testCmd) {
    console.log(`  Test command: ${testCmd}`);
    logInfo(`Test command: ${testCmd}`);
  } else {
    console.log(
      pc.yellow(
        "  No test command detected (configure test-cmd in .sfk/config)",
      ),
    );
    logWarning("No test command detected");
  }

  console.log(`  Log file: ${logFile}`);
  console.log("");

  const prompt = generateSingleTaskPrompt(task, {
    skipCommit: config.skipCommit,
    progressFile,
  });

  logIteration(1, 1, task, engine.model);

  let result = await engine.run(prompt);
  logAiOutput(result.output);
  console.log("");

  // Rate limit handling (OpenCode only)
  if (
    config.engine === "opencode" &&
    (result.hardRateLimited || result.softRateLimited)
  ) {
    let softRetries = 0;

    while (result.softRateLimited || result.hardRateLimited) {
      if (result.hardRateLimited) {
        logWarning("Hard rate limit detected (quota/billing)");
        if (engine.switchToFallback?.()) {
          result = await engine.run(prompt);
          logAiOutput(result.output);
          console.log("");
          break;
        } else {
          logError("Hard rate limit and no fallback available");
          process.exit(1);
        }
      }

      if (result.softRateLimited) {
        if (
          await handleSoftRateLimit(
            softRetries,
            config.softLimitRetries,
            config.softLimitWait,
          )
        ) {
          softRetries++;
          result = await engine.run(prompt);
          logAiOutput(result.output);
          console.log("");
        } else {
          if (engine.switchToFallback?.()) {
            result = await engine.run(prompt);
            logAiOutput(result.output);
            console.log("");
            break;
          } else {
            logError("Soft rate limit persisted, no fallback available");
            process.exit(1);
          }
        }
      }
    }
  }

  if (!result.success) {
    logError(`${engine.name} failed with exit code ${result.exitCode}`);
    process.exit(result.exitCode);
  }

  // Test verification gate
  if (!config.skipTestVerify && testCmd) {
    const verification = verify(testCmd);

    if (!verification.testsWritten) {
      logWarning("No tests written, single task failed");
      appendFailure(
        progressFile,
        1,
        "No test files were created or modified",
        "You MUST write tests before the task can be completed",
      );
      process.exit(1);
    }

    if (!verification.testsPassed) {
      logWarning("Tests failed, single task failed");
      appendFailure(
        progressFile,
        1,
        "Tests failed",
        "Fix the failing tests before marking the task complete",
      );
      process.exit(1);
    }

    logInfo("Verification passed");
  }

  logSuccess("Single task completed successfully!");
  console.log(pc.green("==========================================="));
  console.log(pc.green("  Single task iteration complete"));
  console.log(pc.green("  All tests passing!"));
  console.log(`  Log: ${logFile}`);
  console.log(pc.green("==========================================="));
}
