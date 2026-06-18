import { applyDecorators, SetMetadata } from "@nestjs/common";
import { SchedulerType } from "../enums/scheduler-type.enum";
import {
  SCHEDULE_INTERVAL_OPTIONS,
  SCHEDULER_NAME,
  SCHEDULER_TYPE,
} from "../schedule.constants";

/**
 * Schedules a method to run on a fixed interval (`setInterval`).
 *
 * @publicApi
 */
export function Interval(timeout: number): MethodDecorator;
/**
 * Schedules a named method to run on a fixed interval (`setInterval`).
 *
 * @publicApi
 */
export function Interval(name: string, timeout: number): MethodDecorator;
export function Interval(
  nameOrTimeout: string | number,
  timeout?: number,
): MethodDecorator {
  const [name, intervalTimeout] =
    typeof nameOrTimeout === "string"
      ? [nameOrTimeout, timeout]
      : [undefined, nameOrTimeout];

  return applyDecorators(
    SetMetadata(SCHEDULE_INTERVAL_OPTIONS, { timeout: intervalTimeout }),
    SetMetadata(SCHEDULER_NAME, name),
    SetMetadata(SCHEDULER_TYPE, SchedulerType.INTERVAL),
  );
}
