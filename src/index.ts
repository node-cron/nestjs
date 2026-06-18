/**
 * @node-cron/nestjs
 *
 * A drop-in replacement for `@nestjs/schedule` backed by
 * [node-cron](https://github.com/merencia/node-cron). Same decorators
 * (`@Cron`, `@Interval`, `@Timeout`), same `ScheduleModule` and
 * `SchedulerRegistry`, plus node-cron's extras: distributed scheduling,
 * per-fire coordination, overlap control, execution caps and jitter.
 *
 * @module @node-cron/nestjs
 */
export * from "./enums";
export * from "./decorators";
export * from "./interfaces/schedule-module-options.interface";
export * from "./schedule.module";
export { SchedulerRegistry } from "./scheduler.registry";

// Re-export the node-cron types consumers are most likely to need (coordinator,
// task handle, and the context passed to background tasks) so they don't have
// to import node-cron directly.
export type {
  RunCoordinator,
  ScheduledTask,
  SkipReason,
  TaskContext,
} from "node-cron";
