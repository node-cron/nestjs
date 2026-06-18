import { DynamicModule, Module, Provider, Type } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import {
  ScheduleModuleAsyncOptions,
  ScheduleModuleOptions,
  ScheduleModuleOptionsFactory,
} from "./interfaces/schedule-module-options.interface";
import { SchedulerMetadataAccessor } from "./schedule-metadata.accessor";
import { ScheduleExplorer } from "./schedule.explorer";
import { SCHEDULE_MODULE_OPTIONS } from "./schedule.constants";
import { SchedulerOrchestrator } from "./scheduler.orchestrator";
import { SchedulerRegistry } from "./scheduler.registry";

const withDefaults = (
  options?: ScheduleModuleOptions,
): ScheduleModuleOptions => ({
  cronJobs: true,
  intervals: true,
  timeouts: true,
  useNestLogger: true,
  ...options,
});

/**
 * Registers the node-cron backed scheduler. Drop-in replacement for
 * `@nestjs/schedule`'s `ScheduleModule`.
 *
 * @publicApi
 */
@Module({
  imports: [DiscoveryModule],
  providers: [SchedulerMetadataAccessor, SchedulerOrchestrator],
})
export class ScheduleModule {
  static forRoot(options?: ScheduleModuleOptions): DynamicModule {
    return {
      global: true,
      module: ScheduleModule,
      providers: [
        ScheduleExplorer,
        SchedulerRegistry,
        {
          provide: SCHEDULE_MODULE_OPTIONS,
          useValue: withDefaults(options),
        },
      ],
      exports: [SchedulerRegistry],
    };
  }

  static forRootAsync(options: ScheduleModuleAsyncOptions): DynamicModule {
    return {
      global: true,
      module: ScheduleModule,
      imports: options.imports || [],
      providers: [
        ScheduleExplorer,
        SchedulerRegistry,
        ...this.createAsyncProviders(options),
      ],
      exports: [SchedulerRegistry],
    };
  }

  private static createAsyncProviders(
    options: ScheduleModuleAsyncOptions,
  ): Provider[] {
    if (options.useExisting || options.useFactory) {
      return [this.createAsyncOptionsProvider(options)];
    }
    const useClass = options.useClass as Type<ScheduleModuleOptionsFactory>;
    return [
      this.createAsyncOptionsProvider(options),
      {
        provide: useClass,
        useClass,
      },
    ];
  }

  private static createAsyncOptionsProvider(
    options: ScheduleModuleAsyncOptions,
  ): Provider {
    if (options.useFactory) {
      return {
        provide: SCHEDULE_MODULE_OPTIONS,
        useFactory: async (...args: any[]) =>
          withDefaults(await options.useFactory!(...args)),
        inject: options.inject || [],
      };
    }
    const inject = [
      (options.useClass ||
        options.useExisting) as Type<ScheduleModuleOptionsFactory>,
    ];
    return {
      provide: SCHEDULE_MODULE_OPTIONS,
      useFactory: async (optionsFactory: ScheduleModuleOptionsFactory) =>
        withDefaults(await optionsFactory.createScheduleOptions()),
      inject,
    };
  }
}
