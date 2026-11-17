/**
 * Settings of the job queue. The environment-driven values are documented in backend/.env.example;
 * the timing constants are fixed by the specification and only exposed so tests can shorten them.
 */
export class JobsConfig {
  /** JOBS_WORKER_ENABLED (default true): run the polling worker and the reaper in this process. */
  workerEnabled = true;
  /** JOBS_SCHEDULER_ENABLED (default true): run the schedule tick in this process. */
  schedulerEnabled = true;
  /** JOBS_WORKER_CONCURRENCY (default 2): jobs executed in parallel by this process. */
  concurrency = 2;
  /** JOBS_RETENTION_DAYS (default 30): age after which jobs.cleanup deletes SUCCEEDED / CANCELLED jobs. */
  retentionDays = 30;
  /** JOBS_SHUTDOWN_GRACE_MS (default 10 000): how long shutdown waits for aborted handlers before releasing their jobs. */
  shutdownGraceMs = 10_000;
  /** DISCOVERY_AUTO_SYNC (default false): whether NEW schedules that contact external services start enabled. */
  networkSchedulesEnabledByDefault = false;

  /** Lease length of a claimed job. */
  leaseMs = 60_000;
  /** Interval in which the worker renews the lease of a running job. */
  leaseRenewMs = 20_000;
  /** Pause of an idle worker slot before it polls again. */
  pollIdleMs = 1_000;
  /** Interval of the reaper that recovers jobs with an expired lease. */
  reaperIntervalMs = 15_000;
  /** Interval of the schedule tick (schedules have minute granularity). */
  schedulerTickMs = 30_000;
  /** Minimum distance between two progress writes of one run. */
  progressThrottleMs = 5_000;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;

  return fallback;
}

function readInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value?.trim());

  if (value === undefined || value.trim() === "" || !Number.isInteger(parsed)) return fallback;

  return Math.min(Math.max(parsed, min), max);
}

/** Builds the configuration from environment variables; missing or malformed values fall back to the defaults. */
export function loadJobsConfig(env: NodeJS.ProcessEnv = process.env): JobsConfig {
  const config = new JobsConfig();

  config.workerEnabled = readBoolean(env.JOBS_WORKER_ENABLED, true);
  config.schedulerEnabled = readBoolean(env.JOBS_SCHEDULER_ENABLED, true);
  config.concurrency = readInteger(env.JOBS_WORKER_CONCURRENCY, 2, 1, 32);
  config.retentionDays = readInteger(env.JOBS_RETENTION_DAYS, 30, 1, 3_650);
  config.shutdownGraceMs = readInteger(env.JOBS_SHUTDOWN_GRACE_MS, 10_000, 0, 600_000);
  // Deliberately strict: only an explicit "true" lets a fresh installation contact external services by itself.
  config.networkSchedulesEnabledByDefault = env.DISCOVERY_AUTO_SYNC?.trim().toLowerCase() === "true";

  return config;
}
