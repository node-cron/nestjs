import { BACKGROUND_CRON_METADATA } from "../schedule.constants";
import { CronMetadata, CronOptions } from "./cron.decorator";

/**
 * Options for {@link BackgroundCron}. Identical to {@link CronOptions}: a
 * background job supports the same scheduling, overlap, distribution and
 * execution-cap options as an inline `@Cron`.
 *
 * @publicApi
 */
export type BackgroundCronOptions = CronOptions;

/**
 * Metadata recorded for a `@BackgroundCron` property.
 */
export type BackgroundCronMetadata = CronMetadata;

/**
 * One decorated property: the property name plus its cron metadata. The task
 * file path is read from the property's value at discovery time, not stored
 * here.
 */
export interface BackgroundCronEntry {
  propertyKey: string;
  metadata: BackgroundCronMetadata;
}

/**
 * Schedules a **background** cron job: a task that runs in a forked child
 * process (its own event loop), not in the main NestJS process.
 *
 * Decorate a property whose value is the absolute path to the compiled task
 * file. The file must export a `task` function and runs in isolation, so it has
 * no access to Nest's DI. The idiomatic form is a self-referencing file:
 *
 * ```ts
 * // report.task.ts
 * import { Injectable } from '@nestjs/common';
 * import { BackgroundCron } from '@node-cron/nestjs';
 *
 * // runs in the forked child process:
 * export const task = async (ctx) => {  ...heavy, isolated work... };
 *
 * // runs in the main process; register ReportTask in providers: []
 * @Injectable()
 * export class ReportTask {
 *   @BackgroundCron('0 * * * *', { name: 'report' })
 *   taskFile = __filename; // ESM: fileURLToPath(import.meta.url)
 * }
 * ```
 *
 * @param cronTime A cron expression (5- or 6-field) or a `CronExpression` value.
 * @param options Job execution options (same as `@Cron`).
 *
 * @publicApi
 */
export function BackgroundCron(
  cronTime: string,
  options: BackgroundCronOptions = {},
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const ctor = target.constructor as unknown as Record<
      symbol,
      BackgroundCronEntry[]
    >;

    // Keep a per-class list (own property), so subclasses don't inherit and
    // double-register a parent's background jobs.
    if (!Object.prototype.hasOwnProperty.call(ctor, BACKGROUND_CRON_METADATA)) {
      Object.defineProperty(ctor, BACKGROUND_CRON_METADATA, {
        value: [],
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }

    ctor[BACKGROUND_CRON_METADATA].push({
      propertyKey: String(propertyKey),
      metadata: { ...options, cronTime },
    });
  };
}
