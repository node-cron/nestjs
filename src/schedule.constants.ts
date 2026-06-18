// Metadata keys are namespaced under `NODE_CRON_` so a method decorated by this
// package is never confused with one decorated by `@nestjs/schedule` while both
// modules coexist during a migration.
export const SCHEDULER_NAME = "NODE_CRON_SCHEDULER_NAME";
export const SCHEDULER_TYPE = "NODE_CRON_SCHEDULER_TYPE";

export const SCHEDULE_CRON_OPTIONS = "NODE_CRON_SCHEDULE_CRON_OPTIONS";
export const SCHEDULE_INTERVAL_OPTIONS = "NODE_CRON_SCHEDULE_INTERVAL_OPTIONS";
export const SCHEDULE_TIMEOUT_OPTIONS = "NODE_CRON_SCHEDULE_TIMEOUT_OPTIONS";

export const SCHEDULE_MODULE_OPTIONS = "NODE_CRON_SCHEDULE_MODULE_OPTIONS";

// Background-cron metadata lives on the decorated class' constructor under this
// shared symbol. A Symbol.for key (not reflect-metadata) is used on purpose:
// the @BackgroundCron task file is re-imported in a forked child process where
// reflect-metadata may not be loaded, so the decorator must not depend on it.
export const BACKGROUND_CRON_METADATA = Symbol.for(
  "node-cron:nestjs:background-crons",
);
