import { Injectable, Logger } from "@nestjs/common";
import type { ScheduledTask } from "node-cron";
import { DUPLICATE_SCHEDULER, NO_SCHEDULER_FOUND } from "./schedule.messages";

/**
 * Runtime registry of every scheduled job. Cron jobs are node-cron
 * {@link ScheduledTask} instances, so you get node-cron's full API
 * (`getNextRun`, `getStatus`, `execute`, `on`, distributed coordination, ...)
 * rather than the `cron` package's `CronJob`.
 *
 * Intervals and timeouts keep their native `setInterval` / `setTimeout` ids,
 * identical to `@nestjs/schedule`.
 *
 * @publicApi
 */
@Injectable()
export class SchedulerRegistry {
  private readonly logger = new Logger(SchedulerRegistry.name);

  private readonly cronJobs = new Map<string, ScheduledTask>();
  private readonly intervals = new Map<string, any>();
  private readonly timeouts = new Map<string, any>();

  doesExist(type: "cron" | "timeout" | "interval", name: string): boolean {
    switch (type) {
      case "cron":
        return this.cronJobs.has(name);
      case "interval":
        return this.intervals.has(name);
      case "timeout":
        return this.timeouts.has(name);
      default:
        return false;
    }
  }

  getCronJob(name: string): ScheduledTask {
    const ref = this.cronJobs.get(name);
    if (!ref) {
      throw new Error(NO_SCHEDULER_FOUND("Cron Job", name));
    }
    return ref;
  }

  getCronJobs(): Map<string, ScheduledTask> {
    return this.cronJobs;
  }

  addCronJob(name: string, task: ScheduledTask): void {
    if (this.cronJobs.has(name)) {
      throw new Error(DUPLICATE_SCHEDULER("Cron Job", name));
    }
    this.cronJobs.set(name, task);
  }

  deleteCronJob(name: string): void {
    const task = this.getCronJob(name);
    // A background task's destroy() kills a child process and may reject;
    // route that to the logger instead of leaving an unhandled rejection.
    const destroyed = task.destroy() as void | Promise<void>;
    if (destroyed && typeof destroyed.catch === "function") {
      destroyed.catch((error: any) =>
        this.logger.error(
          `Failed to destroy cron job "${name}": ${error?.message ?? error}`,
        ),
      );
    }
    this.cronJobs.delete(name);
  }

  getInterval(name: string): any {
    const ref = this.intervals.get(name);
    if (typeof ref === "undefined") {
      throw new Error(NO_SCHEDULER_FOUND("Interval", name));
    }
    return ref;
  }

  getIntervals(): string[] {
    return [...this.intervals.keys()];
  }

  addInterval<T = any>(name: string, intervalId: T): void {
    if (this.intervals.has(name)) {
      throw new Error(DUPLICATE_SCHEDULER("Interval", name));
    }
    this.intervals.set(name, intervalId);
  }

  deleteInterval(name: string): void {
    const interval = this.getInterval(name);
    clearInterval(interval);
    this.intervals.delete(name);
  }

  getTimeout(name: string): any {
    const ref = this.timeouts.get(name);
    if (typeof ref === "undefined") {
      throw new Error(NO_SCHEDULER_FOUND("Timeout", name));
    }
    return ref;
  }

  getTimeouts(): string[] {
    return [...this.timeouts.keys()];
  }

  addTimeout<T = any>(name: string, timeoutId: T): void {
    if (this.timeouts.has(name)) {
      throw new Error(DUPLICATE_SCHEDULER("Timeout", name));
    }
    this.timeouts.set(name, timeoutId);
  }

  deleteTimeout(name: string): void {
    const timeout = this.getTimeout(name);
    clearTimeout(timeout);
    this.timeouts.delete(name);
  }
}
