import type { ScheduledTask } from "node-cron";
import { describe, expect, it, vi } from "vitest";
import { SchedulerRegistry } from "./scheduler.registry";

const fakeTask = (id: string): ScheduledTask =>
  ({ id, destroy: vi.fn() }) as unknown as ScheduledTask;

describe("SchedulerRegistry", () => {
  describe("cron jobs", () => {
    it("adds, gets and lists cron jobs", () => {
      const registry = new SchedulerRegistry();
      const task = fakeTask("a");
      registry.addCronJob("a", task);

      expect(registry.getCronJob("a")).toBe(task);
      expect(registry.doesExist("cron", "a")).toBe(true);
      expect([...registry.getCronJobs().keys()]).toEqual(["a"]);
    });

    it("throws when adding a duplicate", () => {
      const registry = new SchedulerRegistry();
      registry.addCronJob("a", fakeTask("a"));
      expect(() => registry.addCronJob("a", fakeTask("a"))).toThrow(/already exists/);
    });

    it("throws when getting an unknown job", () => {
      const registry = new SchedulerRegistry();
      expect(() => registry.getCronJob("missing")).toThrow(/No Cron Job/);
    });

    it("destroys the task on delete and forgets it", () => {
      const registry = new SchedulerRegistry();
      const task = fakeTask("a");
      registry.addCronJob("a", task);
      registry.deleteCronJob("a");

      expect(task.destroy).toHaveBeenCalledOnce();
      expect(registry.doesExist("cron", "a")).toBe(false);
    });
  });

  describe("intervals", () => {
    it("adds, gets, lists and clears intervals", () => {
      const registry = new SchedulerRegistry();
      const id = setInterval(() => {}, 10_000);
      registry.addInterval("i", id);

      expect(registry.getInterval("i")).toBe(id);
      expect(registry.getIntervals()).toEqual(["i"]);
      expect(registry.doesExist("interval", "i")).toBe(true);

      registry.deleteInterval("i");
      expect(registry.doesExist("interval", "i")).toBe(false);
    });

    it("throws on duplicate and unknown", () => {
      const registry = new SchedulerRegistry();
      const id = setInterval(() => {}, 10_000);
      registry.addInterval("i", id);
      expect(() => registry.addInterval("i", id)).toThrow(/already exists/);
      expect(() => registry.getInterval("x")).toThrow(/No Interval/);
      registry.deleteInterval("i");
    });
  });

  describe("timeouts", () => {
    it("adds, gets, lists and clears timeouts", () => {
      const registry = new SchedulerRegistry();
      const id = setTimeout(() => {}, 10_000);
      registry.addTimeout("t", id);

      expect(registry.getTimeout("t")).toBe(id);
      expect(registry.getTimeouts()).toEqual(["t"]);
      expect(registry.doesExist("timeout", "t")).toBe(true);

      registry.deleteTimeout("t");
      expect(registry.doesExist("timeout", "t")).toBe(false);
    });

    it("throws on duplicate and unknown", () => {
      const registry = new SchedulerRegistry();
      const id = setTimeout(() => {}, 10_000);
      registry.addTimeout("t", id);
      expect(() => registry.addTimeout("t", id)).toThrow(/already exists/);
      expect(() => registry.getTimeout("x")).toThrow(/No Timeout/);
      registry.deleteTimeout("t");
    });
  });

  it("doesExist returns false for an unknown type", () => {
    const registry = new SchedulerRegistry();
    expect(registry.doesExist("bogus" as any, "x")).toBe(false);
  });
});
