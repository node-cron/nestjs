import { Injectable } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { RedisLockCoordinator } from "@node-cron/redis-coordinator";
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Cron } from "./decorators/cron.decorator";
import { CronExpression } from "./enums/cron-expression.enum";
import { ScheduleModule } from "./schedule.module";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Run against a real Redis pointed at by REDIS_URL (defaults to localhost). CI
// provides one as a service container; locally, point it at any Redis. If none
// is reachable, the suite skips rather than failing.
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

async function reachable(url: string): Promise<boolean> {
  const probe = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

const available = await reachable(REDIS_URL);

// Build a self-contained "instance": a distributed @Cron with its own Redis
// coordinator. A per-job `runCoordinator` is used (it overrides the global one)
// so two instances can coexist in one process with independent Redis clients,
// the way two hosts of a fleet would.
function buildInstance(coordinator: RedisLockCoordinator) {
  @Injectable()
  class Worker {
    runs = 0;

    @Cron(CronExpression.EVERY_SECOND, {
      name: "fleet-job",
      distributed: true,
      runCoordinator: coordinator,
      distributedLease: 5_000,
    })
    handle() {
      this.runs++;
    }
  }

  return {
    metadata: {
      imports: [ScheduleModule.forRoot({ useNestLogger: false })],
      providers: [Worker],
    },
    Worker,
  };
}

describe.skipIf(!available)("distributed coordination over real Redis", () => {
  let clientA: Redis;
  let clientB: Redis;

  beforeAll(() => {
    clientA = new Redis(REDIS_URL);
    clientB = new Redis(REDIS_URL);
  });

  afterAll(() => {
    clientA?.disconnect();
    clientB?.disconnect();
  });

  it("runs a distributed job once per fire across two instances", async () => {
    const a = buildInstance(new RedisLockCoordinator(clientA));
    const b = buildInstance(new RedisLockCoordinator(clientB));

    const appA: TestingModule = await Test.createTestingModule(a.metadata).compile();
    const appB: TestingModule = await Test.createTestingModule(b.metadata).compile();
    appA.useLogger(false);
    appB.useLogger(false);
    await appA.init();
    await appB.init();

    await wait(3500);

    const total = appA.get(a.Worker).runs + appB.get(b.Worker).runs;

    await appA.close();
    await appB.close();

    const seconds = 3;
    // Coordinated: ~once per fire across the fleet, not once per instance.
    // Without coordination this would be ~2x.
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(seconds + 1);
  });

  it("reports clock drift via healthCheck", async () => {
    const coordinator = new RedisLockCoordinator(clientA);
    const { ok, driftMs } = await coordinator.healthCheck(5_000);
    expect(typeof driftMs).toBe("number");
    expect(ok).toBe(true);
  });
});
