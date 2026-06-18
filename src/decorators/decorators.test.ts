import { describe, expect, it } from "vitest";
import { SchedulerType } from "../enums/scheduler-type.enum";
import {
  SCHEDULE_CRON_OPTIONS,
  SCHEDULE_INTERVAL_OPTIONS,
  SCHEDULE_TIMEOUT_OPTIONS,
  SCHEDULER_NAME,
  SCHEDULER_TYPE,
} from "../schedule.constants";
import { Cron } from "./cron.decorator";
import { Interval } from "./interval.decorator";
import { Timeout } from "./timeout.decorator";

const meta = (target: object, key: string | symbol, prop: string) =>
  Reflect.getMetadata(prop, (target as any)[key]);

describe("@Cron", () => {
  it("stores type, name and merged options with cronTime", () => {
    class Svc {
      @Cron("* * * * *", { name: "job", timeZone: "UTC", distributed: true })
      handle() {}
    }
    const proto = Svc.prototype;
    expect(meta(proto, "handle", SCHEDULER_TYPE)).toBe(SchedulerType.CRON);
    expect(meta(proto, "handle", SCHEDULER_NAME)).toBe("job");
    expect(meta(proto, "handle", SCHEDULE_CRON_OPTIONS)).toEqual({
      name: "job",
      timeZone: "UTC",
      distributed: true,
      cronTime: "* * * * *",
    });
  });

  it("defaults options to an empty object (name undefined)", () => {
    class Svc {
      @Cron("0 0 * * *")
      handle() {}
    }
    expect(meta(Svc.prototype, "handle", SCHEDULER_NAME)).toBeUndefined();
    expect(meta(Svc.prototype, "handle", SCHEDULE_CRON_OPTIONS)).toEqual({
      cronTime: "0 0 * * *",
    });
  });
});

describe("@Interval", () => {
  it("supports the (timeout) overload", () => {
    class Svc {
      @Interval(1000)
      handle() {}
    }
    expect(meta(Svc.prototype, "handle", SCHEDULER_TYPE)).toBe(
      SchedulerType.INTERVAL,
    );
    expect(meta(Svc.prototype, "handle", SCHEDULER_NAME)).toBeUndefined();
    expect(meta(Svc.prototype, "handle", SCHEDULE_INTERVAL_OPTIONS)).toEqual({
      timeout: 1000,
    });
  });

  it("supports the (name, timeout) overload", () => {
    class Svc {
      @Interval("tick", 250)
      handle() {}
    }
    expect(meta(Svc.prototype, "handle", SCHEDULER_NAME)).toBe("tick");
    expect(meta(Svc.prototype, "handle", SCHEDULE_INTERVAL_OPTIONS)).toEqual({
      timeout: 250,
    });
  });
});

describe("@Timeout", () => {
  it("supports both overloads", () => {
    class Svc {
      @Timeout(500)
      a() {}
      @Timeout("later", 750)
      b() {}
    }
    expect(meta(Svc.prototype, "a", SCHEDULER_TYPE)).toBe(SchedulerType.TIMEOUT);
    expect(meta(Svc.prototype, "a", SCHEDULER_NAME)).toBeUndefined();
    expect(meta(Svc.prototype, "a", SCHEDULE_TIMEOUT_OPTIONS)).toEqual({
      timeout: 500,
    });
    expect(meta(Svc.prototype, "b", SCHEDULER_NAME)).toBe("later");
    expect(meta(Svc.prototype, "b", SCHEDULE_TIMEOUT_OPTIONS)).toEqual({
      timeout: 750,
    });
  });
});
