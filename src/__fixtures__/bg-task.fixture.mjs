// Background-task fixture run in a forked child process by node-cron.
// It must export `task`. Kept as a standalone .mjs so the forked child imports
// it directly, independent of how the test runner transforms TypeScript.
import { appendFileSync } from "node:fs";

export const task = async () => {
  // If a marker file is provided, record this child's pid so the test can prove
  // the work happened in a separate process. Execution is also observable from
  // the parent via node-cron's forwarded `execution:finished` event.
  const marker = process.env.BG_TASK_MARKER;
  if (marker) {
    appendFileSync(marker, `${process.pid}\n`);
  }
};
