import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { SchedulerMetadataAccessor } from "../schedule-metadata.accessor";
import { BackgroundCron } from "./background-cron.decorator";

const accessor = new SchedulerMetadataAccessor(new Reflector());

describe("@BackgroundCron", () => {
  it("records property name and merged metadata on the class", () => {
    class Svc {
      @BackgroundCron("0 * * * *", { name: "report", distributed: true })
      reportTask = "/abs/report.task.js";
    }

    const entries = accessor.getBackgroundCrons(Svc);
    expect(entries).toEqual([
      {
        propertyKey: "reportTask",
        metadata: {
          name: "report",
          distributed: true,
          cronTime: "0 * * * *",
        },
      },
    ]);
  });

  it("accumulates multiple background crons on one class", () => {
    class Svc {
      @BackgroundCron("0 * * * *", { name: "a" })
      a = "/a.js";
      @BackgroundCron("*/5 * * * *", { name: "b" })
      b = "/b.js";
    }

    const entries = accessor.getBackgroundCrons(Svc);
    expect(entries.map((e) => e.propertyKey)).toEqual(["a", "b"]);
    expect(entries.map((e) => e.metadata.name)).toEqual(["a", "b"]);
  });

  it("does not let a subclass inherit a parent's background crons", () => {
    class Base {
      @BackgroundCron("0 * * * *", { name: "base" })
      baseTask = "/base.js";
    }
    class Child extends Base {}

    expect(accessor.getBackgroundCrons(Base)).toHaveLength(1);
    expect(accessor.getBackgroundCrons(Child)).toHaveLength(0);
  });

  it("returns an empty list for a class with no background crons", () => {
    class Plain {}
    expect(accessor.getBackgroundCrons(Plain)).toEqual([]);
  });
});
