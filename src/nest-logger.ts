import { Logger } from "@nestjs/common";
import type { Logger as NodeCronLogger } from "node-cron";

/**
 * Adapts node-cron's {@link NodeCronLogger} interface onto Nest's {@link Logger}
 * so node-cron's internal logs appear in the application log with a
 * `NodeCron` context, consistent with the rest of the app.
 */
export function createNestNodeCronLogger(
  context = "NodeCron",
): NodeCronLogger {
  const logger = new Logger(context);
  return {
    info: (message: string) => logger.log(message),
    warn: (message: string) => logger.warn(message),
    error: (message: string | Error, err?: Error) =>
      logger.error(message instanceof Error ? message.message : message, err?.stack),
    debug: (message: string | Error) =>
      logger.debug(message instanceof Error ? message.message : message),
  };
}
