import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNestNodeCronLogger } from "./nest-logger";

afterEach(() => vi.restoreAllMocks());

describe("createNestNodeCronLogger", () => {
  it("routes node-cron log levels onto the Nest Logger", () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const debug = vi.spyOn(Logger.prototype, "debug").mockImplementation(() => {});

    const logger = createNestNodeCronLogger();
    logger.info("hello");
    logger.warn("careful");
    logger.debug("trace");

    expect(log).toHaveBeenCalledWith("hello");
    expect(warn).toHaveBeenCalledWith("careful");
    expect(debug).toHaveBeenCalledWith("trace");

    const err = new Error("boom");
    logger.error(err);
    expect(error).toHaveBeenCalledWith("boom", undefined);

    logger.error("plain", err);
    expect(error).toHaveBeenCalledWith("plain", err.stack);
  });
});
