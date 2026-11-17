import { Injectable } from "@nestjs/common";
import { JobHandler, JobHandlerRegistry, ScheduleDefinition } from "./job.types";

/**
 * In-memory registry of job handlers and schedule definitions (contract: JobHandlerRegistry).
 * Modules register in onModuleInit; the scheduler persists the schedule definitions on application bootstrap.
 */
@Injectable()
export class JobHandlerRegistryImpl implements JobHandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();
  private readonly schedules = new Map<string, ScheduleDefinition>();

  /** Registers the handler of one job type. Throws when the type is already taken. */
  register(handler: JobHandler): void {
    if (typeof handler.type !== "string" || handler.type.trim() === "") {
      throw new Error("A job handler needs a non-empty type.");
    }

    if (this.handlers.has(handler.type)) {
      throw new Error(`A job handler for type "${handler.type}" is already registered.`);
    }

    this.handlers.set(handler.type, handler);
  }

  /** Registers a recurring job. Throws on an invalid definition or a duplicate key. */
  registerSchedule(definition: ScheduleDefinition): void {
    if (!definition.key || !definition.type || !definition.dedupeKey) {
      throw new Error("A job schedule needs a key, a type and a dedupeKey.");
    }

    if (!Number.isInteger(definition.intervalMinutes) || definition.intervalMinutes < 1) {
      throw new Error(`Job schedule "${definition.key}" needs an interval of at least one minute.`);
    }

    if (this.schedules.has(definition.key)) {
      throw new Error(`Job schedule "${definition.key}" is already registered.`);
    }

    this.schedules.set(definition.key, { ...definition });
  }

  /** Handler of a job type, or undefined when no module registered one. */
  getHandler(type: string): JobHandler | undefined {
    return this.handlers.get(type);
  }

  /** All schedule definitions registered in this process. */
  listSchedules(): ScheduleDefinition[] {
    return [...this.schedules.values()];
  }

  /** True when a schedule with this key was registered in this process. */
  hasSchedule(key: string): boolean {
    return this.schedules.has(key);
  }
}
