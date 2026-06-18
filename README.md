# @node-cron/nestjs

A drop-in replacement for [`@nestjs/schedule`](https://docs.nestjs.com/techniques/task-scheduling)
backed by [node-cron](https://github.com/merencia/node-cron).

Keep the exact same decorators (`@Cron`, `@Interval`, `@Timeout`), the same
`ScheduleModule` and `SchedulerRegistry`, and gain node-cron's extras on top:
**distributed scheduling**, **per-fire coordination** (run once across a fleet),
**overlap control**, **execution caps** and **jitter**.

> Migrating is a one-line change: swap the import from `@nestjs/schedule` to
> `@node-cron/nestjs`. Your decorated methods stay exactly as they are.

## Why swap?

| | `@nestjs/schedule` (uses `cron`) | `@node-cron/nestjs` (uses `node-cron`) |
| --- | --- | --- |
| `@Cron` / `@Interval` / `@Timeout` | yes | yes (same API) |
| `CronExpression` enum | yes | yes (identical values) |
| `SchedulerRegistry` | yes | yes (returns node-cron `ScheduledTask`) |
| Skip overlapping runs | `waitForCompletion` | `waitForCompletion` / `noOverlap` |
| Run once across a fleet (distributed) | no | `distributed: true` + a coordinator |
| Per-fire HA coordination (Redis) | no | `@node-cron/redis-coordinator` |
| Cap executions / random jitter | no | `maxExecutions`, `maxRandomDelay` |
| Background tasks (forked process) | no | `@BackgroundCron` |

### Differences to know before you migrate

The decorators and module API are drop-in, but two things differ on purpose:

- **`SchedulerRegistry.getCronJob(name)` returns a node-cron `ScheduledTask`,
  not the `cron` package's `CronJob`.** This is the upgrade (you get
  `getNextRun()`, `getStatus()`, `execute()`, `on(...)`, distributed
  coordination), but it is a breaking change in shape: code calling
  `.nextDate()`, `.lastDate()` or reading `.running` must be updated. See
  [SchedulerRegistry](#schedulerregistry) for the equivalents.
- **`utcOffset` is not supported.** node-cron schedules by IANA timezone, so
  `utcOffset` is ignored with a warning. Use `timeZone` instead.

## Install

```bash
npm install @node-cron/nestjs node-cron
# peer deps you already have in a Nest app: @nestjs/common @nestjs/core
```

`node-cron` is a peer dependency, so install it alongside this package.

## Usage

Identical to `@nestjs/schedule`.

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@node-cron/nestjs';
import { TasksService } from './tasks.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [TasksService],
})
export class AppModule {}
```

```ts
// tasks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval, Timeout, CronExpression } from '@node-cron/nestjs';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  @Cron(CronExpression.EVERY_30_SECONDS)
  handleCron() {
    this.logger.log('Called every 30 seconds');
  }

  @Interval(10_000)
  handleInterval() {
    this.logger.log('Called every 10 seconds');
  }

  @Timeout(5_000)
  handleTimeout() {
    this.logger.log('Called once, 5 seconds after startup');
  }
}
```

### `@Cron` options

Everything from `@nestjs/schedule` plus node-cron's extras:

```ts
@Cron('0 3 * * *', {
  name: 'nightly-backup',     // retrieve it from SchedulerRegistry
  timeZone: 'America/Sao_Paulo',
  waitForCompletion: true,    // alias: noOverlap — skip overlapping runs
  disabled: false,
  initialDelay: 2_000,        // delay the first run after bootstrap
  threshold: 250,             // missed-deadline tolerance (ms)

  // node-cron extensions:
  distributed: true,          // run once across a fleet (requires name + coordinator)
  distributedLease: 5 * 60_000,
  maxExecutions: 10,
  maxRandomDelay: 1_000,      // jitter to spread fleet load
})
handleCron() {}
```

> `utcOffset` is not supported by node-cron (which schedules by IANA timezone).
> If set, it is ignored with a warning. Use `timeZone`.

### SchedulerRegistry

`getCronJob(name)` returns a node-cron
[`ScheduledTask`](https://github.com/merencia/node-cron), so you get its full
API instead of the `cron` package's `CronJob`:

```ts
import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@node-cron/nestjs';

@Injectable()
export class JobsController {
  constructor(private readonly registry: SchedulerRegistry) {}

  inspect() {
    const task = this.registry.getCronJob('nightly-backup');
    task.getNextRun();   // Date | null
    task.getStatus();    // 'idle' | 'running' | 'stopped' | ...
    task.execute();      // run it now, off-schedule
    task.on('execution:failed', (ctx) => { /* ... */ });
    task.stop();
  }
}
```

## Background tasks

A background task runs in a **forked child process** with its own event loop,
so heavy or blocking work never stalls your main NestJS process. This is a
node-cron feature that `@nestjs/schedule` does not have.

Declare one with `@BackgroundCron`. Unlike `@Cron` (which decorates a method
whose body runs inline), `@BackgroundCron` decorates a **property whose value is
the path to the task file**. The reasoning: an inline job's code lives in the
method, a background job's code lives in another file, so the decorator target
reflects where the code is.

### The self-referencing single-file pattern

The cleanest layout keeps the task and its schedule in one file that points at
itself with `__filename`:

```ts
// report.task.ts
import { Injectable } from '@nestjs/common';
import { BackgroundCron, type TaskContext } from '@node-cron/nestjs';

// (A) Runs in the forked CHILD process. A plain standalone function: there is
//     no Nest DI here. node-cron imports this compiled file and calls `task`.
export const task = async (ctx: TaskContext) => {
  // heavy, isolated work
};

// (B) Runs in the MAIN process. Register ReportTask in a module's providers.
//     The property holds this file's own path.
@Injectable()
export class ReportTask {
  @BackgroundCron('0 * * * *', { name: 'report' })
  taskFile = __filename;
}
```

```ts
// some.module.ts
@Module({ providers: [ReportTask] })
export class SomeModule {}
```

That is all. On bootstrap the task is registered in `SchedulerRegistry` (under
`name`), forked, started, and cleaned up on shutdown, exactly like a `@Cron`.

### Rules and gotchas

- **The task file must `export const task`.** That named export is what the
  child process runs. Anything else in the file (the `@Injectable` class) is
  ignored by the child.
- **Point the property at the compiled `.js`.** Use `__filename` (CommonJS, the
  `nest build` default) or `fileURLToPath(import.meta.url)` (ESM). It must be an
  absolute path string; the explorer throws a clear error if the property does
  not hold one.
- **`export const task` gets no Nest DI.** It is a different process. It cannot
  inject providers or read in-memory state from the main app. It can use
  `process.env`, import plain modules, and open its own connections (see the
  escape hatch below if you truly need DI).
- **Fork happens once, not per fire.** node-cron forks the child when the task
  starts and runs the schedule inside it, so the file's import cost is paid once
  at startup, not on every run.
- **`reflect-metadata` is handled for you.** The child re-imports the task file,
  and decorators (including Nest's `@Injectable`) need `reflect-metadata`.
  Importing anything from `@node-cron/nestjs` pulls it in transitively, so the
  child is covered without you adding an import.
- **All `@Cron` options work**, including `distributed`, `timeZone`,
  `maxExecutions`, etc.

### Distributed background tasks

Combine both: a heavy job that runs in its own process **and** only on one
instance of the fleet per fire. The coordinator lives in the parent process and
the child coordinates through it over IPC, so it shares the same backend
(e.g. Redis) as every other instance.

```ts
@BackgroundCron('0 3 * * *', {
  name: 'nightly-backup',
  distributed: true,
  distributedLease: 5 * 60_000,
})
taskFile = __filename;
```

### Escape hatch: DI inside a background task

If the background work genuinely needs DI, bootstrap a standalone application
context inside `task`:

```ts
import { NestFactory } from '@nestjs/core';
import { TaskModule } from './task.module';
import { ReportService } from './report.service';

export const task = async (ctx: TaskContext) => {
  const app = await NestFactory.createApplicationContext(TaskModule, { logger: false });
  try {
    await app.get(ReportService).generate(ctx.date);
  } finally {
    await app.close();
  }
};
```

> **Do not bootstrap your full `AppModule` here.** If you do, its
> `ScheduleModule` runs again *inside the child* and re-schedules every job in
> that process. Use a lean `TaskModule` that imports only what the task needs
> (no `ScheduleModule`). Note the context is rebuilt (and connections reopened)
> on each run, so this suits heavy, infrequent jobs.

### When to use what

- Heavy/isolated work, no DI needed → **`@BackgroundCron`**. Its sweet spot.
- Needs DI, no process isolation needed → plain **`@Cron`** (main process, full
  DI). Just don't block the event loop.
- Needs both DI and isolation → `@BackgroundCron` + `createApplicationContext`
  with the lean-module caveat above.

## Distributed scheduling

Run the same schedule on N instances and have each fire execute **once** across
the fleet. Provide a coordinator and mark jobs `distributed: true`.

### Highly-available, per-fire coordination with Redis

Use [`@node-cron/redis-coordinator`](https://github.com/node-cron/redis-coordinator):
any instance can win each fire, and it survives the loss of any node.

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@node-cron/nestjs';
import { RedisLockCoordinator } from '@node-cron/redis-coordinator';
import { createClient } from 'redis';

const redis = createClient();
await redis.connect();

@Module({
  imports: [
    ScheduleModule.forRoot({
      coordinator: new RedisLockCoordinator(redis),
    }),
  ],
})
export class AppModule {}
```

```ts
@Cron('0 3 * * *', {
  name: 'nightly-backup',           // required for distributed (the coordination key)
  distributed: true,
  distributedLease: 5 * 60_000,     // must exceed the job's worst-case runtime
})
handleBackup() {}
```

You bring your own Redis client (`redis` or `ioredis`); the coordinator just
uses it. See the redis-coordinator README for the full guarantee and tuning.

### Per-job coordinator

A coordinator passed to a single `@Cron` overrides the module-level one:

```ts
@Cron('* * * * *', { name: 'job', distributed: true, runCoordinator: myCoordinator })
handle() {}
```

### Async configuration

```ts
ScheduleModule.forRootAsync({
  imports: [RedisModule],
  inject: [REDIS_CLIENT],
  useFactory: (redis) => ({ coordinator: new RedisLockCoordinator(redis) }),
});
```

## Module options

```ts
ScheduleModule.forRoot({
  cronJobs: true,      // register @Cron methods (default true)
  intervals: true,     // register @Interval methods (default true)
  timeouts: true,      // register @Timeout methods (default true)
  useNestLogger: true, // route node-cron logs through Nest's Logger (default true)
  coordinator,         // global node-cron RunCoordinator for distributed jobs
});
```

## Compatibility

- Node.js >= 20.
- NestJS v9, v10 and v11 (`@nestjs/common` / `@nestjs/core` are peer deps).
- `node-cron` >= 4.4.1 (peer dep).
- Ships ESM + CJS with TypeScript types.

## License

ISC
