import { ModuleMetadata, Type } from "@nestjs/common";
import type { RunCoordinator } from "node-cron";

/**
 * Options for {@link ScheduleModule.forRoot}.
 *
 * @publicApi
 */
export interface ScheduleModuleOptions {
  /**
   * Register methods decorated with `@Cron`. Defaults to `true`.
   */
  cronJobs?: boolean;
  /**
   * Register methods decorated with `@Interval`. Defaults to `true`.
   */
  intervals?: boolean;
  /**
   * Register methods decorated with `@Timeout`. Defaults to `true`.
   */
  timeouts?: boolean;
  /**
   * A node-cron {@link RunCoordinator} applied globally via
   * `cron.setRunCoordinator`. Every `@Cron({ distributed: true })` job uses it
   * to elect a single runner per fire across a fleet. A per-`@Cron`
   * `runCoordinator` overrides this for that job.
   *
   * Pair it with `@node-cron/redis-coordinator` for highly-available, per-fire
   * coordination backed by Redis.
   */
  coordinator?: RunCoordinator;
  /**
   * Route node-cron's internal logs through Nest's `Logger`. Defaults to
   * `true`. Set to `false` to keep node-cron's default console logger.
   */
  useNestLogger?: boolean;
}

/**
 * @publicApi
 */
export interface ScheduleModuleOptionsFactory {
  createScheduleOptions():
    | Promise<ScheduleModuleOptions>
    | ScheduleModuleOptions;
}

/**
 * @publicApi
 */
export interface ScheduleModuleAsyncOptions
  extends Pick<ModuleMetadata, "imports"> {
  useExisting?: Type<ScheduleModuleOptionsFactory>;
  useClass?: Type<ScheduleModuleOptionsFactory>;
  useFactory?: (
    ...args: any[]
  ) => Promise<ScheduleModuleOptions> | ScheduleModuleOptions;
  inject?: any[];
}
