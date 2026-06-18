// A @BackgroundCron task file is re-imported in a forked child process where
// nothing has loaded reflect-metadata yet. Decorators (including Nest's own
// @Injectable in that file) need it, so importing it here means any file that
// pulls in our decorators gets it transitively. Idempotent; it is a peer dep
// of every NestJS app.
import "reflect-metadata";

export * from "./cron.decorator";
export * from "./background-cron.decorator";
export * from "./interval.decorator";
export * from "./timeout.decorator";
