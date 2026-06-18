import { Injectable, Module } from "@nestjs/common";
import { ModuleMetadata } from "@nestjs/common/interfaces";
import { Test, TestingModule } from "@nestjs/testing";
import { setRunCoordinator, type RunCoordinator } from "node-cron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cron } from "./decorators/cron.decorator";
import { Interval } from "./decorators/interval.decorator";
import { Timeout } from "./decorators/timeout.decorator";
import { CronExpression } from "./enums/cron-expression.enum";
import { ScheduleModuleOptions } from "./interfaces/schedule-module-options.interface";
import { ScheduleModule } from "./schedule.module";
import { SchedulerRegistry } from "./scheduler.registry";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
class JobsService {
  cronCount = 0;
  intervalCount = 0;
  timeoutCount = 0;
  disabledCount = 0;

  @Cron(CronExpression.EVERY_SECOND, { name: "tick" })
  onCron() {
    this.cronCount++;
  }

  @Interval("loop", 200)
  onInterval() {
    this.intervalCount++;
  }

  @Timeout("once", 150)
  onTimeout() {
    this.timeoutCount++;
  }

  @Cron(CronExpression.EVERY_SECOND, { name: "off", disabled: true })
  onDisabled() {
    this.disabledCount++;
  }
}

let app: TestingModule | undefined;

// The application context (not a full HTTP app) is enough: init() fires
// onModuleInit + onApplicationBootstrap and close() fires the shutdown hooks,
// which is all the scheduler needs. This keeps the test suite free of an HTTP
// platform (and its transitive dependencies).
async function boot(metadata: ModuleMetadata): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule(metadata).compile();
  moduleRef.useLogger(false);
  await moduleRef.init();
  app = moduleRef;
  return moduleRef;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
  setRunCoordinator(undefined);
});

describe("ScheduleModule (integration)", () => {
  it("runs cron, interval and timeout jobs end to end", async () => {
    const nest = await boot({
      imports: [ScheduleModule.forRoot()],
      providers: [JobsService],
    });
    const service = nest.get(JobsService);

    await wait(1200);

    expect(service.cronCount).toBeGreaterThanOrEqual(1);
    expect(service.intervalCount).toBeGreaterThanOrEqual(3);
    expect(service.timeoutCount).toBe(1);
  });

  it("does not run disabled cron jobs but registers them", async () => {
    const nest = await boot({
      imports: [ScheduleModule.forRoot()],
      providers: [JobsService],
    });
    const service = nest.get(JobsService);
    const registry = nest.get(SchedulerRegistry);

    await wait(1200);

    expect(service.disabledCount).toBe(0);
    expect(registry.doesExist("cron", "off")).toBe(true);
    expect(registry.getCronJob("off").getStatus()).toBe("stopped");
  });

  it("exposes node-cron ScheduledTask through the registry", async () => {
    const nest = await boot({
      imports: [ScheduleModule.forRoot()],
      providers: [JobsService],
    });
    const registry = nest.get(SchedulerRegistry);

    const task = registry.getCronJob("tick");
    expect(task.getNextRun()).toBeInstanceOf(Date);
    expect(typeof task.execute).toBe("function");
    expect(registry.getCronJobs().has("tick")).toBe(true);
  });

  it("stops a job when deleted from the registry", async () => {
    const nest = await boot({
      imports: [ScheduleModule.forRoot()],
      providers: [JobsService],
    });
    const service = nest.get(JobsService);
    const registry = nest.get(SchedulerRegistry);

    registry.deleteCronJob("tick");
    expect(registry.doesExist("cron", "tick")).toBe(false);

    const after = service.cronCount;
    await wait(1200);
    expect(service.cronCount).toBe(after);
  });

  it("honors the cronJobs:false toggle", async () => {
    const nest = await boot({
      imports: [ScheduleModule.forRoot({ cronJobs: false })],
      providers: [JobsService],
    });
    const service = nest.get(JobsService);
    const registry = nest.get(SchedulerRegistry);

    await wait(1200);
    expect(service.cronCount).toBe(0);
    expect(() => registry.getCronJob("tick")).toThrow();
    // intervals still run
    expect(service.intervalCount).toBeGreaterThanOrEqual(3);
  });

  it("supports forRootAsync with useFactory", async () => {
    const nest = await boot({
      imports: [
        ScheduleModule.forRootAsync({
          useFactory: (): ScheduleModuleOptions => ({ timeouts: false }),
        }),
      ],
      providers: [JobsService],
    });
    const service = nest.get(JobsService);

    await wait(1200);
    expect(service.cronCount).toBeGreaterThanOrEqual(1);
    expect(service.timeoutCount).toBe(0);
  });

  it("supports forRootAsync with useClass", async () => {
    @Injectable()
    class OptionsFactory {
      createScheduleOptions(): ScheduleModuleOptions {
        return { intervals: false };
      }
    }

    const nest = await boot({
      imports: [ScheduleModule.forRootAsync({ useClass: OptionsFactory })],
      providers: [JobsService],
    });
    const service = nest.get(JobsService);

    await wait(1200);
    expect(service.cronCount).toBeGreaterThanOrEqual(1);
    expect(service.intervalCount).toBe(0);
  });

  it("supports forRootAsync with useExisting", async () => {
    @Injectable()
    class OptionsFactory {
      createScheduleOptions(): ScheduleModuleOptions {
        return { cronJobs: false };
      }
    }

    @Module({ providers: [OptionsFactory], exports: [OptionsFactory] })
    class OptionsModule {}

    const nest = await boot({
      imports: [
        ScheduleModule.forRootAsync({
          imports: [OptionsModule],
          useExisting: OptionsFactory,
        }),
      ],
      providers: [JobsService],
    });
    const service = nest.get(JobsService);

    await wait(1200);
    expect(service.cronCount).toBe(0);
    expect(service.intervalCount).toBeGreaterThanOrEqual(3);
  });
});

describe("ScheduleModule distributed coordination", () => {
  @Injectable()
  class DistributedService {
    runs = 0;

    @Cron(CronExpression.EVERY_SECOND, { name: "dist", distributed: true })
    handle() {
      this.runs++;
    }
  }

  it("routes distributed jobs through a global coordinator", async () => {
    const shouldRun = vi.fn().mockReturnValue(true);
    const coordinator: RunCoordinator = { shouldRun };

    const nest = await boot({
      imports: [ScheduleModule.forRoot({ coordinator })],
      providers: [DistributedService],
    });
    const service = nest.get(DistributedService);

    await wait(1200);

    expect(shouldRun).toHaveBeenCalled();
    expect(service.runs).toBeGreaterThanOrEqual(1);
  });

  it("skips the run when the coordinator elects another instance", async () => {
    const shouldRun = vi.fn().mockReturnValue(false);
    const coordinator: RunCoordinator = { shouldRun };

    const nest = await boot({
      imports: [ScheduleModule.forRoot({ coordinator })],
      providers: [DistributedService],
    });
    const service = nest.get(DistributedService);

    await wait(1200);

    expect(shouldRun).toHaveBeenCalled();
    expect(service.runs).toBe(0);
  });
});
