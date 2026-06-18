import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DiscoveryService, MetadataScanner } from "@nestjs/core";
import { InstanceWrapper } from "@nestjs/core/injector/instance-wrapper";
import { SchedulerType } from "./enums/scheduler-type.enum";
import { ScheduleModuleOptions } from "./interfaces/schedule-module-options.interface";
import { SchedulerMetadataAccessor } from "./schedule-metadata.accessor";
import { SCHEDULE_MODULE_OPTIONS } from "./schedule.constants";
import { SchedulerOrchestrator } from "./scheduler.orchestrator";

@Injectable()
export class ScheduleExplorer implements OnModuleInit {
  private readonly logger = new Logger("Scheduler");

  constructor(
    @Inject(SCHEDULE_MODULE_OPTIONS)
    private readonly moduleOptions: ScheduleModuleOptions,
    private readonly schedulerOrchestrator: SchedulerOrchestrator,
    private readonly discoveryService: DiscoveryService,
    private readonly metadataAccessor: SchedulerMetadataAccessor,
    private readonly metadataScanner: MetadataScanner,
  ) {}

  onModuleInit() {
    this.explore();
  }

  explore() {
    const instanceWrappers: InstanceWrapper[] = [
      ...this.discoveryService.getControllers(),
      ...this.discoveryService.getProviders(),
    ];

    instanceWrappers.forEach((wrapper: InstanceWrapper) => {
      const { instance } = wrapper;
      if (!instance || !Object.getPrototypeOf(instance)) {
        return;
      }

      const processMethod = (name: string) =>
        wrapper.isDependencyTreeStatic()
          ? this.lookupSchedulers(instance, name)
          : this.warnForNonStaticProviders(wrapper, instance, name);

      this.metadataScanner
        .getAllMethodNames(Object.getPrototypeOf(instance))
        .forEach(processMethod);

      // Background crons are declared on properties, not methods, so they are
      // discovered separately from the method scan above.
      this.lookupBackgroundCrons(wrapper, instance);
    });
  }

  lookupBackgroundCrons(
    wrapper: InstanceWrapper<any>,
    instance: Record<string, unknown>,
  ) {
    const entries = this.metadataAccessor.getBackgroundCrons(
      instance.constructor,
    );
    if (entries.length === 0 || !this.moduleOptions.cronJobs) {
      return;
    }

    for (const { propertyKey, metadata } of entries) {
      if (!wrapper.isDependencyTreeStatic()) {
        this.logger.warn(
          `Cannot register background cron "${wrapper.name}.${propertyKey}" because it is defined in a non static provider.`,
        );
        continue;
      }

      const taskPath = instance[propertyKey];
      if (typeof taskPath !== "string" || taskPath.length === 0) {
        throw new Error(
          `@BackgroundCron on "${wrapper.name}.${propertyKey}" must hold the task file path ` +
            `(e.g. \`${propertyKey} = __filename\`), but its value is ${typeof taskPath}.`,
        );
      }

      this.schedulerOrchestrator.addBackgroundCron(taskPath, metadata);
    }
  }

  lookupSchedulers(instance: Record<string, Function>, key: string) {
    const methodRef = instance[key];
    const metadata = this.metadataAccessor.getSchedulerType(methodRef);

    switch (metadata) {
      case SchedulerType.CRON: {
        if (!this.moduleOptions.cronJobs) {
          return;
        }
        const cronMetadata = this.metadataAccessor.getCronMetadata(methodRef);
        // node-cron catches execution errors itself (emitting
        // `execution:failed` and logging), so the bound method is handed over
        // untouched, preserving node-cron's event semantics.
        const cronFn = methodRef.bind(instance) as () => unknown;
        return this.schedulerOrchestrator.addCron(cronFn, cronMetadata!);
      }
      case SchedulerType.TIMEOUT: {
        if (!this.moduleOptions.timeouts) {
          return;
        }
        const timeoutMetadata =
          this.metadataAccessor.getTimeoutMetadata(methodRef);
        const name = this.metadataAccessor.getSchedulerName(methodRef);
        const timeoutFn = this.wrapFunctionInTryCatchBlocks(methodRef, instance);
        return this.schedulerOrchestrator.addTimeout(
          timeoutFn,
          timeoutMetadata!.timeout,
          name,
        );
      }
      case SchedulerType.INTERVAL: {
        if (!this.moduleOptions.intervals) {
          return;
        }
        const intervalMetadata =
          this.metadataAccessor.getIntervalMetadata(methodRef);
        const name = this.metadataAccessor.getSchedulerName(methodRef);
        const intervalFn = this.wrapFunctionInTryCatchBlocks(
          methodRef,
          instance,
        );
        return this.schedulerOrchestrator.addInterval(
          intervalFn,
          intervalMetadata!.timeout,
          name,
        );
      }
    }
  }

  warnForNonStaticProviders(
    wrapper: InstanceWrapper<any>,
    instance: Record<string, Function>,
    key: string,
  ) {
    const methodRef = instance[key];
    const metadata = this.metadataAccessor.getSchedulerType(methodRef);

    switch (metadata) {
      case SchedulerType.CRON: {
        if (!this.moduleOptions.cronJobs) {
          return;
        }
        this.logger.warn(
          `Cannot register cron job "${wrapper.name}@${key}" because it is defined in a non static provider.`,
        );
        break;
      }
      case SchedulerType.TIMEOUT: {
        if (!this.moduleOptions.timeouts) {
          return;
        }
        this.logger.warn(
          `Cannot register timeout "${wrapper.name}@${key}" because it is defined in a non static provider.`,
        );
        break;
      }
      case SchedulerType.INTERVAL: {
        if (!this.moduleOptions.intervals) {
          return;
        }
        this.logger.warn(
          `Cannot register interval "${wrapper.name}@${key}" because it is defined in a non static provider.`,
        );
        break;
      }
    }
  }

  private wrapFunctionInTryCatchBlocks(
    methodRef: Function,
    instance: object,
  ): () => Promise<void> {
    return async () => {
      try {
        await methodRef.call(instance);
      } catch (error) {
        this.logger.error(error);
      }
    };
  }
}
