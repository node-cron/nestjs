import {
  BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";
import {
  createTask,
  setLogger,
  setRunCoordinator,
  type ScheduledTask,
  type TaskOptions,
} from "node-cron";
import { randomUUID } from "node:crypto";
import { CronMetadata } from "./decorators/cron.decorator";
import { ScheduleModuleOptions } from "./interfaces/schedule-module-options.interface";
import { createNestNodeCronLogger } from "./nest-logger";
import { SCHEDULE_MODULE_OPTIONS } from "./schedule.constants";
import {
  DISTRIBUTED_REQUIRES_NAME,
  DUPLICATE_SCHEDULER,
} from "./schedule.messages";
import { SchedulerRegistry } from "./scheduler.registry";

type TargetHost = { target: () => void };
type TimeoutHost = { timeout: number };

type CronJobOptions = {
  // A function for an inline `@Cron`, or a task file path for a background
  // `@BackgroundCron` (node-cron forks it into a child process).
  target: (() => unknown) | string;
  metadata: CronMetadata;
  ref?: ScheduledTask;
  initialDelayRef?: ReturnType<typeof setTimeout>;
};
type IntervalOptions = TargetHost & TimeoutHost & { ref?: ReturnType<typeof setInterval> };
type TimeoutOptions = TargetHost & TimeoutHost & { ref?: ReturnType<typeof setTimeout> };

@Injectable()
export class SchedulerOrchestrator
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger("Scheduler");

  private readonly cronJobs: Record<string, CronJobOptions> = {};
  private readonly timeouts: Record<string, TimeoutOptions> = {};
  private readonly intervals: Record<string, IntervalOptions> = {};

  constructor(
    @Inject(SCHEDULE_MODULE_OPTIONS)
    private readonly moduleOptions: ScheduleModuleOptions,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap() {
    if (this.moduleOptions.useNestLogger !== false) {
      setLogger(createNestNodeCronLogger());
    }
    if (this.moduleOptions.coordinator) {
      setRunCoordinator(this.moduleOptions.coordinator);
    }
    this.mountTimeouts();
    this.mountIntervals();
    this.mountCron();
  }

  beforeApplicationShutdown() {
    this.clearTimeouts();
    this.clearIntervals();
    this.closeCronJobs();
  }

  mountIntervals() {
    Object.keys(this.intervals).forEach((key) => {
      const options = this.intervals[key];
      const ref = setInterval(options.target, options.timeout);
      options.ref = ref;
      this.schedulerRegistry.addInterval(key, ref);
    });
  }

  mountTimeouts() {
    Object.keys(this.timeouts).forEach((key) => {
      const options = this.timeouts[key];
      const ref = setTimeout(options.target, options.timeout);
      options.ref = ref;
      this.schedulerRegistry.addTimeout(key, ref);
    });
  }

  mountCron() {
    Object.keys(this.cronJobs).forEach((key) => {
      const { metadata, target } = this.cronJobs[key];

      if (metadata.utcOffset != null) {
        this.logger.warn(
          `Cron job "${key}" sets \`utcOffset\`, which node-cron does not support. ` +
            `It is ignored; use \`timeZone\` instead.`,
        );
      }

      const task = createTask(
        metadata.cronTime,
        target,
        this.toNodeCronOptions(key, metadata),
      );

      this.cronJobs[key].ref = task;
      this.schedulerRegistry.addCronJob(key, task);

      if (metadata.disabled) {
        return;
      }

      if (metadata.initialDelay && metadata.initialDelay > 0) {
        this.cronJobs[key].initialDelayRef = setTimeout(() => {
          if (this.schedulerRegistry.doesExist("cron", key)) {
            this.startTask(key, task);
          }
        }, metadata.initialDelay);
      } else {
        this.startTask(key, task);
      }
    });
  }

  // Inline tasks start synchronously, but a background task forks and its
  // start() returns a promise that rejects when the task file can't be loaded
  // (bad path, unsupported syntax, ...). Route that to the logger instead of
  // leaving it as an unhandled rejection.
  private startTask(key: string, task: ScheduledTask) {
    const started = task.start() as void | Promise<void>;
    if (started && typeof started.catch === "function") {
      started.catch((error: any) =>
        this.logger.error(
          `Failed to start scheduled task "${key}": ${error?.message ?? error}`,
        ),
      );
    }
  }

  clearTimeouts() {
    this.schedulerRegistry
      .getTimeouts()
      .forEach((key) => this.schedulerRegistry.deleteTimeout(key));
  }

  clearIntervals() {
    this.schedulerRegistry
      .getIntervals()
      .forEach((key) => this.schedulerRegistry.deleteInterval(key));
  }

  closeCronJobs() {
    Object.values(this.cronJobs).forEach(({ initialDelayRef }) => {
      if (initialDelayRef !== undefined) {
        clearTimeout(initialDelayRef);
      }
    });
    Array.from(this.schedulerRegistry.getCronJobs().keys()).forEach((key) =>
      this.schedulerRegistry.deleteCronJob(key),
    );
  }

  addTimeout(methodRef: () => void, timeout: number, name: string = randomUUID()) {
    this.timeouts[name] = { target: methodRef, timeout };
  }

  addInterval(methodRef: () => void, timeout: number, name: string = randomUUID()) {
    this.intervals[name] = { target: methodRef, timeout };
  }

  addCron(methodRef: () => unknown, metadata: CronMetadata) {
    this.registerCronJob(methodRef, metadata);
  }

  /**
   * Registers a background cron: `taskPath` is the file run in a forked child
   * process. Mounting is identical to an inline cron; node-cron forks because
   * the target is a string path rather than a function.
   */
  addBackgroundCron(taskPath: string, metadata: CronMetadata) {
    this.registerCronJob(taskPath, metadata);
  }

  // Inline and background crons share one keyed map, so a name collision
  // between any two of them must fail loudly here rather than silently
  // overwrite (which would drop a job and bypass the registry's duplicate
  // check, since only the survivor ever reaches it).
  private registerCronJob(
    target: (() => unknown) | string,
    metadata: CronMetadata,
  ) {
    if (metadata.distributed && !metadata.name) {
      throw new Error(DISTRIBUTED_REQUIRES_NAME(metadata.name ?? "<unnamed>"));
    }
    const name = metadata.name || randomUUID();
    if (this.cronJobs[name]) {
      throw new Error(DUPLICATE_SCHEDULER("Cron Job", name));
    }
    this.cronJobs[name] = { target, metadata };
  }

  private toNodeCronOptions(name: string, metadata: CronMetadata): TaskOptions {
    const options: TaskOptions = {
      name,
      timezone: metadata.timeZone,
      noOverlap: metadata.noOverlap ?? metadata.waitForCompletion,
      distributed: metadata.distributed,
      runCoordinator: metadata.runCoordinator,
      distributedLease: metadata.distributedLease,
      maxExecutions: metadata.maxExecutions,
      maxRandomDelay: metadata.maxRandomDelay,
      missedExecutionTolerance: metadata.threshold,
      suppressMissedWarning: metadata.suppressMissedWarning,
      executeTimeout: metadata.executeTimeout,
    };
    // Drop undefined keys so node-cron applies its own defaults.
    (Object.keys(options) as (keyof TaskOptions)[]).forEach((k) => {
      if (options[k] === undefined) {
        delete options[k];
      }
    });
    return options;
  }
}
