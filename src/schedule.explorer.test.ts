import { Logger } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundCron } from "./decorators/background-cron.decorator";
import { Cron } from "./decorators/cron.decorator";
import { Interval } from "./decorators/interval.decorator";
import { Timeout } from "./decorators/timeout.decorator";
import { ScheduleModuleOptions } from "./interfaces/schedule-module-options.interface";
import { SchedulerMetadataAccessor } from "./schedule-metadata.accessor";
import { ScheduleExplorer } from "./schedule.explorer";

class Svc {
  ran = 0;
  @Cron("* * * * *", { name: "c" })
  onCron() {
    this.ran++;
  }
  @Interval("i", 1000)
  onInterval() {}
  @Timeout("t", 1000)
  onTimeout() {}
  plain() {}
}

const orchestrator = {
  addCron: vi.fn(),
  addInterval: vi.fn(),
  addTimeout: vi.fn(),
  addBackgroundCron: vi.fn(),
};

const staticWrapper = (name: string) =>
  ({ name, isDependencyTreeStatic: () => true }) as any;
const dynamicWrapper = (name: string) =>
  ({ name, isDependencyTreeStatic: () => false }) as any;

const makeExplorer = (options: ScheduleModuleOptions) =>
  new ScheduleExplorer(
    { cronJobs: true, intervals: true, timeouts: true, ...options },
    orchestrator as any,
    {} as any,
    new SchedulerMetadataAccessor(new Reflector()),
    {} as any,
  );

beforeEach(() => {
  orchestrator.addCron.mockReset();
  orchestrator.addInterval.mockReset();
  orchestrator.addTimeout.mockReset();
  orchestrator.addBackgroundCron.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("ScheduleExplorer.lookupSchedulers", () => {
  it("dispatches each scheduler type to the orchestrator", () => {
    const explorer = makeExplorer({});
    const svc = new Svc();
    explorer.lookupSchedulers(svc as any, "onCron");
    explorer.lookupSchedulers(svc as any, "onInterval");
    explorer.lookupSchedulers(svc as any, "onTimeout");
    explorer.lookupSchedulers(svc as any, "plain");

    expect(orchestrator.addCron).toHaveBeenCalledOnce();
    expect(orchestrator.addInterval).toHaveBeenCalledWith(
      expect.any(Function),
      1000,
      "i",
    );
    expect(orchestrator.addTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      1000,
      "t",
    );
  });

  it("hands cron a function bound to the instance", () => {
    const explorer = makeExplorer({});
    const svc = new Svc();
    explorer.lookupSchedulers(svc as any, "onCron");

    const boundFn = orchestrator.addCron.mock.calls[0][0] as () => void;
    boundFn();
    expect(svc.ran).toBe(1);
  });

  it("respects the per-type toggles", () => {
    const svc = new Svc();
    makeExplorer({ cronJobs: false }).lookupSchedulers(svc as any, "onCron");
    makeExplorer({ intervals: false }).lookupSchedulers(svc as any, "onInterval");
    makeExplorer({ timeouts: false }).lookupSchedulers(svc as any, "onTimeout");

    expect(orchestrator.addCron).not.toHaveBeenCalled();
    expect(orchestrator.addInterval).not.toHaveBeenCalled();
    expect(orchestrator.addTimeout).not.toHaveBeenCalled();
  });
});

class BgSvc {
  @BackgroundCron("0 * * * *", { name: "report" })
  reportTask = "/abs/report.task.js";
}

describe("ScheduleExplorer.lookupBackgroundCrons", () => {
  it("discovers a background cron and passes its file path to the orchestrator", () => {
    const explorer = makeExplorer({});
    explorer.lookupBackgroundCrons(staticWrapper("BgSvc"), new BgSvc() as any);

    expect(orchestrator.addBackgroundCron).toHaveBeenCalledWith(
      "/abs/report.task.js",
      { name: "report", cronTime: "0 * * * *" },
    );
  });

  it("respects the cronJobs toggle", () => {
    makeExplorer({ cronJobs: false }).lookupBackgroundCrons(
      staticWrapper("BgSvc"),
      new BgSvc() as any,
    );
    expect(orchestrator.addBackgroundCron).not.toHaveBeenCalled();
  });

  it("throws when the decorated property does not hold a path", () => {
    class Bad {
      @BackgroundCron("0 * * * *", { name: "x" })
      taskFile = undefined as any;
    }
    expect(() =>
      makeExplorer({}).lookupBackgroundCrons(staticWrapper("Bad"), new Bad() as any),
    ).toThrow(/must hold the task file path/);
  });

  it("warns instead of registering for a non static provider", () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    makeExplorer({}).lookupBackgroundCrons(
      dynamicWrapper("BgSvc"),
      new BgSvc() as any,
    );
    expect(orchestrator.addBackgroundCron).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("background cron"));
  });

  it("does nothing for a class without background crons", () => {
    makeExplorer({}).lookupBackgroundCrons(staticWrapper("Svc"), new Svc() as any);
    expect(orchestrator.addBackgroundCron).not.toHaveBeenCalled();
  });
});

describe("ScheduleExplorer.warnForNonStaticProviders", () => {
  it("warns for cron, interval and timeout in non-static providers", () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    const explorer = makeExplorer({});
    const svc = new Svc();
    const wrapper = { name: "Svc" } as any;

    explorer.warnForNonStaticProviders(wrapper, svc as any, "onCron");
    explorer.warnForNonStaticProviders(wrapper, svc as any, "onInterval");
    explorer.warnForNonStaticProviders(wrapper, svc as any, "onTimeout");

    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("cron job"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("interval"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("timeout"));
  });

  it("stays silent when the matching type is toggled off", () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    const explorer = makeExplorer({ cronJobs: false });
    explorer.warnForNonStaticProviders(
      { name: "Svc" } as any,
      new Svc() as any,
      "onCron",
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
