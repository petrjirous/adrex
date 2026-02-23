import { readdir } from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { config } from "./lib/config.js";
import { configureIndex, getAddressIndex } from "./lib/meilisearch.js";
import { downloadRuianCsv } from "./services/pipeline/download.js";
import { parseRuianCsv } from "./services/pipeline/parse.js";
import {
  buildMunicipalityMap,
  transformToDocument,
} from "./services/pipeline/transform.js";

const logger = pino({ name: "pipeline" });

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function resolveExistingCsvDir(dataDir: string): Promise<string | null> {
  try {
    const csvDir = path.join(dataDir, "CSV");
    const entries = await readdir(csvDir);
    const hasCsv = entries.some((entry) => entry.toLowerCase().endsWith(".csv"));
    return hasCsv ? csvDir : null;
  } catch {
    return null;
  }
}
async function main(): Promise<void> {
  const downloadOnly = hasFlag("--download-only");
  const indexOnly = hasFlag("--index-only");
  const start = Date.now();
  const dataDir = config.pipeline.dataDir;
  const csvUrl = config.pipeline.csvUrl;
  let csvDir: string | null = null;
  if (!indexOnly) {
    csvDir = await downloadRuianCsv(dataDir, csvUrl);
  } else {
    csvDir = await resolveExistingCsvDir(dataDir);
    if (!csvDir) {
      const message = "CSV directory not found. Run without --index-only first.";
      logger.error(message);
      throw new Error(message);
    }
  }
  if (downloadOnly) {
    logger.info({ csvDir }, "Download-only mode complete");
    return;
  }

  await configureIndex();
  const index = getAddressIndex();
  const municipalityMap = await buildMunicipalityMap();

  const batchSize = config.pipeline.batchSize;
  let batch = [] as ReturnType<typeof transformToDocument>[];
  let total = 0;
  let skipped = 0;
  const tasks: number[] = [];

  const startIndexing = Date.now();
  for await (const row of parseRuianCsv(csvDir)) {
    try {
      const document = transformToDocument(row, municipalityMap);
      if (!document.id) {
        skipped += 1;
        continue;
      }
      batch.push(document);
      total += 1;
    } catch (error) {
      skipped += 1;
      logger.warn({ err: error }, "Failed to transform row");
    }

    if (batch.length >= batchSize) {
      const task = await index.addDocuments(batch);
      tasks.push(task.taskUid);
      batch = [];
      logger.info({ total }, "Indexed batch");
    }
  }

  if (batch.length > 0) {
    const task = await index.addDocuments(batch);
    tasks.push(task.taskUid);
  }

  logger.info({ taskCount: tasks.length }, "All batches submitted. Waiting for Meilisearch to process...");
  const lastTaskUid = tasks[tasks.length - 1];
  if (lastTaskUid !== undefined) {
    await index.waitForTask(lastTaskUid, { timeOutMs: 600_000, intervalMs: 5_000 });
  }

  const durationMs = Date.now() - start;
  const indexingMs = Date.now() - startIndexing;
  logger.info(
    { total, skipped, durationMs, indexingMs },
    "Pipeline finished"
  );
}

main().catch((err) => {
  logger.error({ err }, "Pipeline failed");
  process.exitCode = 1;
});
