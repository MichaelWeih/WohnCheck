/**
 * Re-scores pending duplicate candidates and proposes new ones (job companies.find-duplicates), in this process.
 *   npm run companies:find-duplicates
 */
process.env.JOBS_WORKER_ENABLED = "false";
process.env.JOBS_SCHEDULER_ENABLED = "false";

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DuplicateFinderService } from "../modules/companies/duplicate-finder.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const result = await app.get(DuplicateFinderService).run();
    console.log(`Prüfkandidaten: ${result.removed} entfernt, ${result.rescored} neu bewertet, ${result.added} hinzugefügt.`);
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
