/**
 * Runs the landlord import in this process: requests a sync of the given sources (default: all enabled ones)
 * and drains the job queue until the runs are complete. Same pipeline as the admin trigger
 * POST /admin/discovery/sources/:key/sync — re-running it is safe (idempotent, no duplicates).
 *
 *   npm run discovery:sync                 # wikidata + gleif
 *   npm run discovery:sync -- gleif        # one source
 *   npm run discovery:sync -- gleif Hausverwaltung   # one scope
 */
process.env.JOBS_WORKER_ENABLED = "false";
process.env.JOBS_SCHEDULER_ENABLED = "false";

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DiscoveryService } from "../modules/discovery/discovery.service";
import { DISCOVERY_JOBS } from "../modules/discovery/discovery.types";
import { EXTERNAL_JOBS } from "../modules/external/external.types";
import { JobQueueService } from "../modules/jobs/job.types";
import { PrismaService } from "../modules/prisma/prisma.service";

async function main() {
  const [sourceArg, scopeArg] = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  try {
    const discovery = app.get(DiscoveryService);
    const queue = app.get(JobQueueService);
    const prisma = app.get(PrismaService);
    const sources = sourceArg ? [sourceArg] : discovery.providers.filter((p) => p.isEnabled()).map((p) => p.key);
    for (const key of sources) {
      const { enqueued } = await discovery.requestSync(key, scopeArg);
      console.log(`${key}: ${enqueued.length} Bereich(e) eingereiht`);
    }
    const started = Date.now();
    const runs = await queue.drain({ types: [DISCOVERY_JOBS.SYNC_SOURCE, EXTERNAL_JOBS.LINK_LANDLORD] });
    const [active, candidates, sourceRecords] = await Promise.all([
      prisma.landlord.count({ where: { status: "ACTIVE" } }),
      prisma.landlord.count({ where: { status: "CANDIDATE" } }),
      prisma.sourceRecord.count(),
    ]);
    console.log(
      `Fertig nach ${Math.round((Date.now() - started) / 1000)} s, ${runs} Job-Läufe. ` +
        `Vermieter: ${active} öffentlich, ${candidates} Kandidaten; Quelldatensätze: ${sourceRecords}.`,
    );
    for (const state of await discovery.sourceStates())
      for (const scope of state.scopes)
        if (scope.lastError) console.log(`  ${state.key}/${scope.scope}: ${scope.lastError}`);
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
