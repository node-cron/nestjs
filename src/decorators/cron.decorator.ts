import { applyDecorators, SetMetadata } from "@nestjs/common";
import type { RunCoordinator } from "node-cron";
import { SchedulerType } from "../enums/scheduler-type.enum";
import {
  SCHEDULE_CRON_OPTIONS,
  SCHEDULER_NAME,
  SCHEDULER_TYPE,
} from "../schedule.constants";

/**
 * Options for the {@link Cron} decorator.
 *
 * The first block mirrors `@nestjs/schedule`'s `CronOptions` so existing code
 * compiles unchanged. The second block exposes node-cron's extra capabilities
 * (distributed coordination, overlap control, execution caps, jitter, ...).
 *
 * @publicApi
 */
export type CronOptions = {
  /**
   * Name of the cron job. Required to retrieve it from `SchedulerRegistry` and
   * mandatory when `distributed` is `true` (it forms the coordination key
   * shared across instances).
   */
  name?: string;

  /**
   * IANA timezone for the schedule, e.g. `'America/Sao_Paulo'`. Maps to
   * node-cron's `timezone`.
   */
  timeZone?: string;

  /**
   * Not supported by node-cron, which schedules by IANA timezone only. If set,
   * it is ignored with a warning. Use `timeZone` instead.
   *
   * @deprecated unsupported by node-cron; use `timeZone`.
   */
  utcOffset?: number;

  /**
   * If `true`, no new run starts while the previous one is still running;
   * overlapping fires are skipped. Maps to node-cron's `noOverlap`. Alias of
   * {@link CronOptions.noOverlap} kept for `@nestjs/schedule` parity.
   */
  waitForCompletion?: boolean;

  /**
   * If `true`, the job is never registered.
   * @default false
   */
  disabled?: boolean;

  /**
   * Threshold in ms for executing vs. skipping missed deadlines caused by a
   * busy event loop. Maps to node-cron's `missedExecutionTolerance`.
   */
  threshold?: number;

  /**
   * Delay in ms before the first execution after bootstrap. Subsequent runs
   * follow the normal schedule. Useful when the job depends on resources that
   * are not ready at startup.
   */
  initialDelay?: number;

  // --- node-cron extensions ------------------------------------------------

  /**
   * Skip overlapping executions. Same effect as {@link CronOptions.waitForCompletion}.
   */
  noOverlap?: boolean;

  /**
   * Run this job as a distributed task: across a fleet of instances running the
   * same schedule, only one instance runs each fire. Requires `name` and a
   * coordinator (set globally via `ScheduleModule.forRoot({ coordinator })` or
   * per-job via {@link CronOptions.runCoordinator}).
   */
  distributed?: boolean;

  /**
   * Per-job coordinator. Overrides the module-level coordinator for this job.
   */
  runCoordinator?: RunCoordinator;

  /**
   * Lease duration in ms for a distributed run. Must be longer than the job's
   * worst-case runtime so the lock is not released mid-run.
   */
  distributedLease?: number;

  /**
   * Stop the job automatically after this many executions.
   */
  maxExecutions?: number;

  /**
   * Add a random delay of up to this many ms before each run, to spread load
   * across a fleet ("jitter").
   */
  maxRandomDelay?: number;

  /**
   * Silence the warning printed when an execution is missed.
   */
  suppressMissedWarning?: boolean;

  /**
   * Abort an execution that runs longer than this many ms.
   */
  executeTimeout?: number;
};

/**
 * Schedules a method as a cron job backed by node-cron.
 *
 * @param cronTime A cron expression (5- or 6-field) or a {@link CronExpression} value.
 * @param options Job execution options.
 *
 * @publicApi
 */
export function Cron(
  cronTime: string,
  options: CronOptions = {},
): MethodDecorator {
  const name = options.name;
  return applyDecorators(
    SetMetadata(SCHEDULE_CRON_OPTIONS, { ...options, cronTime }),
    SetMetadata(SCHEDULER_NAME, name),
    SetMetadata(SCHEDULER_TYPE, SchedulerType.CRON),
  );
}

/**
 * The cron metadata stored on a decorated method.
 */
export type CronMetadata = CronOptions & { cronTime: string };
