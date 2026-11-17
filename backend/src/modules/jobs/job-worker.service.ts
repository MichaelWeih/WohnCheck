import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { sanitizeErrorMessage } from "./job-policy";
import { JobRunnerService } from "./job-runner.service";
import { JobsConfig } from "./jobs.config";

/** Longest pause of a polling slot or the reaper after repeated database errors. */
const MAX_ERROR_BACKOFF_MS = 30_000;

/**
 * The polling worker: JOBS_WORKER_CONCURRENCY slots that claim and execute jobs, plus the reaper that recovers
 * jobs whose lease expired. Started on application bootstrap when JOBS_WORKER_ENABLED is true.
 * It also owns the graceful shutdown of every run in this process, including runs started through drain().
 */
@Injectable()
export class JobWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("Jobs");
  private loops: Promise<void>[] = [];
  private stopController: AbortController | null = null;

  constructor(
    private readonly runner: JobRunnerService,
    private readonly config: JobsConfig,
  ) {}

  /** Starts the polling slots when the worker is enabled for this process. */
  onApplicationBootstrap(): void {
    if (this.config.workerEnabled) this.start();
  }

  /** Stops polling and shuts the runs of this process down gracefully (also with the worker disabled). */
  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  /** True while the polling slots are running. */
  get isRunning(): boolean {
    return this.stopController !== null;
  }

  /** Starts the polling slots and the reaper. No-op when they are already running. */
  start(): void {
    if (this.stopController) return;

    const controller = new AbortController();

    this.stopController = controller;
    this.loops = [this.reaperLoop(controller.signal)];

    for (let slot = 0; slot < this.config.concurrency; slot++) {
      this.loops.push(this.pollLoop(controller.signal));
    }

    this.logger.log(`Job worker started with ${this.config.concurrency} slot(s).`);
  }

  /**
   * Graceful shutdown: no more claims, running handlers are aborted and get the grace period
   * (JOBS_SHUTDOWN_GRACE_MS) to settle, whatever is still running afterwards is released.
   */
  async stop(): Promise<void> {
    this.stopController?.abort();
    this.stopController = null;

    await this.runner.shutdown();
    // A slot whose claim was in flight when the runner stopped releases that job itself and then ends.
    await Promise.all(this.loops);
    this.loops = [];
  }

  /** One worker slot: claim, run, repeat; idle briefly when nothing is due. */
  private async pollLoop(stop: AbortSignal): Promise<void> {
    let consecutiveErrors = 0;

    while (!stop.aborted) {
      try {
        const job = await this.runner.claim();

        consecutiveErrors = 0;

        if (job) {
          await this.runner.run(job);
          continue;
        }
      } catch (error) {
        consecutiveErrors += 1;
        this.logger.warn(`Claiming a job failed: ${sanitizeErrorMessage(error)}`);
      }

      await sleep(this.pauseAfter(this.config.pollIdleMs, consecutiveErrors), stop);
    }
  }

  /** Recovers jobs with an expired lease at start and then periodically. */
  private async reaperLoop(stop: AbortSignal): Promise<void> {
    let consecutiveErrors = 0;

    while (!stop.aborted) {
      try {
        await this.runner.reapExpiredLeases();
        consecutiveErrors = 0;
      } catch (error) {
        consecutiveErrors += 1;
        this.logger.warn(`Recovering expired leases failed: ${sanitizeErrorMessage(error)}`);
      }

      await sleep(this.pauseAfter(this.config.reaperIntervalMs, consecutiveErrors), stop);
    }
  }

  /** Regular pause, doubled per consecutive error so an unreachable database is not hammered. */
  private pauseAfter(regularMs: number, consecutiveErrors: number): number {
    if (consecutiveErrors === 0) return regularMs;

    return Math.min(Math.max(regularMs, 1_000) * 2 ** Math.min(consecutiveErrors, 10), MAX_ERROR_BACKOFF_MS);
  }
}

/** Waits `ms`, or until `stop` aborts. Never rejects. */
function sleep(ms: number, stop: AbortSignal): Promise<void> {
  if (stop.aborted) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      stop.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);

    stop.addEventListener("abort", finish, { once: true });
  });
}
