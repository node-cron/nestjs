/**
 * The kind of scheduler a decorated method registers.
 *
 * @publicApi
 */
export enum SchedulerType {
  CRON = 1,
  TIMEOUT,
  INTERVAL,
}
