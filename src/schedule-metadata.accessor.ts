import { Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { BackgroundCronEntry } from "./decorators/background-cron.decorator";
import { CronMetadata } from "./decorators/cron.decorator";
import { SchedulerType } from "./enums/scheduler-type.enum";
import { IntervalMetadata } from "./interfaces/interval-metadata.interface";
import { TimeoutMetadata } from "./interfaces/timeout-metadata.interface";
import {
  BACKGROUND_CRON_METADATA,
  SCHEDULE_CRON_OPTIONS,
  SCHEDULE_INTERVAL_OPTIONS,
  SCHEDULE_TIMEOUT_OPTIONS,
  SCHEDULER_NAME,
  SCHEDULER_TYPE,
} from "./schedule.constants";

@Injectable()
export class SchedulerMetadataAccessor {
  constructor(private readonly reflector: Reflector) {}

  getSchedulerType(target: Function): SchedulerType | undefined {
    return this.getMetadata(SCHEDULER_TYPE, target);
  }

  getSchedulerName(target: Function): string | undefined {
    return this.getMetadata(SCHEDULER_NAME, target);
  }

  getTimeoutMetadata(target: Function): TimeoutMetadata | undefined {
    return this.getMetadata(SCHEDULE_TIMEOUT_OPTIONS, target);
  }

  getIntervalMetadata(target: Function): IntervalMetadata | undefined {
    return this.getMetadata(SCHEDULE_INTERVAL_OPTIONS, target);
  }

  getCronMetadata(target: Function): CronMetadata | undefined {
    return this.getMetadata(SCHEDULE_CRON_OPTIONS, target);
  }

  /**
   * Background-cron entries declared on a class. `target` is the class
   * constructor (e.g. `instance.constructor`). Only the class' own entries are
   * returned, so subclasses don't inherit a parent's jobs.
   */
  getBackgroundCrons(target: Function): BackgroundCronEntry[] {
    const ctor = target as unknown as Record<symbol, BackgroundCronEntry[]>;
    return Object.prototype.hasOwnProperty.call(ctor, BACKGROUND_CRON_METADATA)
      ? ctor[BACKGROUND_CRON_METADATA]
      : [];
  }

  private getMetadata<T>(key: string, target: Function): T | undefined {
    const isObject =
      typeof target === "object"
        ? target !== null
        : typeof target === "function";

    return isObject ? this.reflector.get<T>(key, target) : undefined;
  }
}
