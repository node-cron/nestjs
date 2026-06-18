import { Injectable } from "@nestjs/common";
import { TestingModule, Test } from "@nestjs/testing";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { BackgroundCron } from "./decorators/background-cron.decorator";
import { ScheduleModule } from "./schedule.module";
import { SchedulerRegistry } from "./scheduler.registry";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Absolute path to the compiled-as-shipped .mjs fixture (no TS transform).
const fixturePath = fileURLToPath(
  new URL("./__fixtures__/bg-task.fixture.mjs", import.meta.url),
);

let markerFile: string;

@Injectable()
class BackgroundJobs {
  @BackgroundCron("* * * * * *", { name: "bg-fork" })
  taskFile = fixturePath;
}

let app: TestingModule | undefined;

beforeAll(() => {
  markerFile = join(mkdtempSync(join(tmpdir(), "ncn-")), "marker.log");
  process.env.BG_TASK_MARKER = markerFile;
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("@BackgroundCron (real forked process)", () => {
  it("runs the task file in a separate child process", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot({ useNestLogger: false })],
      providers: [BackgroundJobs],
    }).compile();
    moduleRef.useLogger(false);
    await moduleRef.init();
    app = moduleRef;

    const registry = moduleRef.get(SchedulerRegistry);
    const task = registry.getCronJob("bg-fork");

    let finished = 0;
    task.on("execution:finished", () => {
      finished++;
    });

    await wait(2500);

    // The parent saw executions complete...
    expect(finished).toBeGreaterThanOrEqual(1);

    // ...and they happened in a child process whose pid is not ours.
    const pids = readFileSync(markerFile, "utf8")
      .split("\n")
      .filter(Boolean);
    expect(pids.length).toBeGreaterThanOrEqual(1);
    expect(pids.every((pid) => Number(pid) !== process.pid)).toBe(true);
    // node-cron forks once and runs the schedule inside that child.
    expect(new Set(pids).size).toBe(1);
  });
});
