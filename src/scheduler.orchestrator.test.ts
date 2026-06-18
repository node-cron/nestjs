import { Logger } from "@nestjs/common";
import { createTask, setLogger, setRunCoordinator } from "node-cron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CronMetadata } from "./decorators/cron.decorator";
import { ScheduleModuleOptions } from "./interfaces/schedule-module-options.interface";
import { SchedulerOrchestrator } from "./scheduler.orchestrator";
import { SchedulerRegistry } from "./scheduler.registry";

vi.mock("node-cron", () => ({
  createTask: vi.fn(),
  setLogger: vi.fn(),
  setRunCoordinator: vi.fn(),
}));

const makeTask = () => ({ start: vi.fn(), destroy: vi.fn() });

const build = (options: ScheduleModuleOptions = {}) => {
  const registry = new SchedulerRegistry();
  const orchestrator = new SchedulerOrchestrator(options, registry);
  return { registry, orchestrator };
};

beforeEach(() => {
  vi.mocked(createTask).mockReset();
  vi.mocked(setLogger).mockReset();
  vi.mocked(setRunCoordinator).mockReset();
  vi.mocked(createTask).mockImplementation(() => makeTask() as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SchedulerOrchestrator cron", () => {
  it("maps Nest cron options onto node-cron task options", () => {
    const { orchestrator } = build();
    const target = () => {};
    const metadata: CronMetadata = {
      cronTime: "* * * * *",
      name: "job",
      timeZone: "America/Sao_Paulo",
      waitForCompletion: true,
      threshold: 120,
      maxExecutions: 5,
      maxRandomDelay: 1000,
      distributed: true,
      distributedLease: 60_000,
    };
    orchestrator.addCron(target, metadata);
    orchestrator.onApplicationBootstrap();

    expect(createTask).toHaveBeenCalledWith("* * * * *", target, {
      name: "job",
      timezone: "America/Sao_Paulo",
      noOverlap: true,
      missedExecutionTolerance: 120,
      maxExecutions: 5,
      maxRandomDelay: 1000,
      distributed: true,
      distributedLease: 60_000,
    });
  });

  it("starts the task by default and registers it", () => {
    const { orchestrator, registry } = build();
    const task = makeTask();
    vi.mocked(createTask).mockReturnValue(task as any);

    orchestrator.addCron(() => {}, { cronTime: "* * * * *", name: "job" });
    orchestrator.onApplicationBootstrap();

    expect(task.start).toHaveBeenCalledOnce();
    expect(registry.getCronJob("job")).toBe(task);
  });

  it("does not start a disabled job but still registers it", () => {
    const { orchestrator, registry } = build();
    const task = makeTask();
    vi.mocked(createTask).mockReturnValue(task as any);

    orchestrator.addCron(() => {}, {
      cronTime: "* * * * *",
      name: "job",
      disabled: true,
    });
    orchestrator.onApplicationBootstrap();

    expect(task.start).not.toHaveBeenCalled();
    expect(registry.doesExist("cron", "job")).toBe(true);
  });

  it("defers start by initialDelay", () => {
    vi.useFakeTimers();
    const { orchestrator } = build();
    const task = makeTask();
    vi.mocked(createTask).mockReturnValue(task as any);

    orchestrator.addCron(() => {}, {
      cronTime: "* * * * *",
      name: "job",
      initialDelay: 5000,
    });
    orchestrator.onApplicationBootstrap();

    expect(task.start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(task.start).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("throws when distributed is set without a name", () => {
    const { orchestrator } = build();
    expect(() =>
      orchestrator.addCron(() => {}, {
        cronTime: "* * * * *",
        distributed: true,
      }),
    ).toThrow(/distributed/);
  });

  it("schedules a background cron by passing the file path to node-cron", () => {
    const { orchestrator, registry } = build();
    const task = makeTask();
    vi.mocked(createTask).mockReturnValue(task as any);

    orchestrator.addBackgroundCron("/abs/report.task.js", {
      cronTime: "0 * * * *",
      name: "report",
      distributed: true,
      distributedLease: 5000,
    });
    orchestrator.onApplicationBootstrap();

    // node-cron forks when the 2nd arg is a string path rather than a function.
    expect(createTask).toHaveBeenCalledWith("0 * * * *", "/abs/report.task.js", {
      name: "report",
      distributed: true,
      distributedLease: 5000,
    });
    expect(task.start).toHaveBeenCalledOnce();
    expect(registry.getCronJob("report")).toBe(task);
  });

  it("does not start a disabled background cron but still registers it", () => {
    const { orchestrator, registry } = build();
    const task = makeTask();
    vi.mocked(createTask).mockReturnValue(task as any);

    orchestrator.addBackgroundCron("/abs/x.js", {
      cronTime: "* * * * *",
      name: "bg-off",
      disabled: true,
    });
    orchestrator.onApplicationBootstrap();

    expect(task.start).not.toHaveBeenCalled();
    expect(registry.doesExist("cron", "bg-off")).toBe(true);
  });

  it("routes a failed start() to the logger instead of rejecting", async () => {
    const error = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    const { orchestrator } = build();
    const task = {
      start: vi.fn().mockRejectedValue(new Error("cannot load task file")),
      destroy: vi.fn(),
    };
    vi.mocked(createTask).mockReturnValue(task as any);

    orchestrator.addBackgroundCron("/missing.task.js", {
      cronTime: "* * * * *",
      name: "bg",
    });
    // Must not throw synchronously nor leave an unhandled rejection.
    orchestrator.onApplicationBootstrap();
    await Promise.resolve();
    await Promise.resolve();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to start scheduled task "bg"'),
    );
  });

  it("throws when a distributed background cron has no name", () => {
    const { orchestrator } = build();
    expect(() =>
      orchestrator.addBackgroundCron("/abs/x.js", {
        cronTime: "0 * * * *",
        distributed: true,
      }),
    ).toThrow(/distributed/);
  });

  it("warns and ignores utcOffset", () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    const { orchestrator } = build();
    orchestrator.addCron(() => {}, {
      cronTime: "* * * * *",
      name: "job",
      utcOffset: -180,
    });
    orchestrator.onApplicationBootstrap();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("utcOffset"));
    expect(vi.mocked(createTask).mock.calls[0][2]).not.toHaveProperty("timezone");
  });
});

describe("SchedulerOrchestrator coordination & logging", () => {
  it("installs the Nest logger by default", () => {
    const { orchestrator } = build();
    orchestrator.onApplicationBootstrap();
    expect(setLogger).toHaveBeenCalledOnce();
  });

  it("skips the Nest logger when useNestLogger is false", () => {
    const { orchestrator } = build({ useNestLogger: false });
    orchestrator.onApplicationBootstrap();
    expect(setLogger).not.toHaveBeenCalled();
  });

  it("installs a global coordinator when provided", () => {
    const coordinator = { shouldRun: () => true };
    const { orchestrator } = build({ coordinator });
    orchestrator.onApplicationBootstrap();
    expect(setRunCoordinator).toHaveBeenCalledWith(coordinator);
  });

  it("does not install a coordinator when none is provided", () => {
    const { orchestrator } = build();
    orchestrator.onApplicationBootstrap();
    expect(setRunCoordinator).not.toHaveBeenCalled();
  });
});

describe("SchedulerOrchestrator timers & shutdown", () => {
  it("mounts intervals and timeouts and clears them on shutdown", () => {
    vi.useFakeTimers();
    const { orchestrator, registry } = build();
    const intervalFn = vi.fn();
    const timeoutFn = vi.fn();

    orchestrator.addInterval(intervalFn, 1000, "i");
    orchestrator.addTimeout(timeoutFn, 500, "t");
    orchestrator.onApplicationBootstrap();

    expect(registry.doesExist("interval", "i")).toBe(true);
    expect(registry.doesExist("timeout", "t")).toBe(true);

    orchestrator.beforeApplicationShutdown();
    expect(registry.getIntervals()).toEqual([]);
    expect(registry.getTimeouts()).toEqual([]);
    vi.useRealTimers();
  });

  it("destroys cron jobs and clears initialDelay timers on shutdown", () => {
    vi.useFakeTimers();
    const { orchestrator, registry } = build();
    const task = makeTask();
    vi.mocked(createTask).mockReturnValue(task as any);

    orchestrator.addCron(() => {}, {
      cronTime: "* * * * *",
      name: "job",
      initialDelay: 10_000,
    });
    orchestrator.onApplicationBootstrap();
    orchestrator.beforeApplicationShutdown();

    expect(task.destroy).toHaveBeenCalledOnce();
    expect(registry.doesExist("cron", "job")).toBe(false);
    // The deferred start must not fire after shutdown.
    vi.advanceTimersByTime(10_000);
    expect(task.start).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("generates names for unnamed intervals and timeouts", () => {
    const { orchestrator, registry } = build();
    orchestrator.addInterval(vi.fn(), 1000);
    orchestrator.addTimeout(vi.fn(), 1000);
    orchestrator.onApplicationBootstrap();
    expect(registry.getIntervals()).toHaveLength(1);
    expect(registry.getTimeouts()).toHaveLength(1);
    orchestrator.beforeApplicationShutdown();
  });
});
