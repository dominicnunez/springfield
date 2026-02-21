import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { logWarning } from "../ui/logger.js";

const PRD_TASK_PATTERN = /^\s*-\s*\[([ xX])\]\s*(.+)$/;

export interface Task {
  text: string;
  completed: boolean;
  lineNumber: number;
}

/**
 * Parse tasks from PRD.md file
 * Tasks are in the format: - [ ] task description or - [x] task description
 */
export function parsePrd(prdPath: string): Task[] {
  if (!existsSync(prdPath)) {
    return [];
  }

  const content = readFileSync(prdPath, "utf-8");
  const lines = content.split("\n");
  const tasks: Task[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const match = line.match(PRD_TASK_PATTERN);
    if (match) {
      const completed = match[1].toLowerCase() === "x";
      const text = match[2].trim();

      tasks.push({
        text,
        completed,
        lineNumber: i,
      });
    }
  }

  return tasks;
}

/**
 * Get the first incomplete task
 */
export function getFirstIncompleteTask(tasks: Task[]): Task | undefined {
  return tasks.find((task) => !task.completed);
}

/**
 * Count incomplete tasks
 */
export function countIncompleteTasks(tasks: Task[]): number {
  return tasks.filter((task) => !task.completed).length;
}

/**
 * Check if all tasks are complete
 */
export function allTasksComplete(tasks: Task[]): boolean {
  return tasks.length > 0 && tasks.every((task) => task.completed);
}

/**
 * Mark a task as complete in the PRD file
 */
export function markTaskComplete(prdPath: string, task: Task): void {
  if (!existsSync(prdPath)) {
    return;
  }

  try {
    const content = readFileSync(prdPath, "utf-8");
    const lines = content.split("\n");

    if (task.lineNumber < lines.length) {
      lines[task.lineNumber] = lines[task.lineNumber].replace(/\[\s\]/, "[x]");
      writeFileSync(prdPath, lines.join("\n"));
    }
  } catch (err) {
    logWarning(`Failed to mark task complete in ${prdPath}: ${err}`);
  }
}

/**
 * Get task summary for display
 */
export function getTaskSummary(tasks: Task[]): string {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;
  const remaining = total - completed;

  return `${completed}/${total} tasks complete (${remaining} remaining)`;
}
