import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import pino from "pino";
import { config } from "../../lib/config.js";
const logger = pino({ name: "pipeline:download" });

const RUIAN_DOWNLOAD_PAGE = "https://nahlizenidokn.cuzk.cz/StahniAdresniMistaRUIAN.aspx";
const LINK_ID_REGEX = /id="ctl00_bodyPlaceHolder_linkCR"\s+href="([^"]+)"/;

async function resolveDownloadUrl(): Promise<string> {
  logger.info({ page: RUIAN_DOWNLOAD_PAGE }, "Resolving current RÚIAN CSV URL");
  const response = await fetch(RUIAN_DOWNLOAD_PAGE);
  if (!response.ok) {
    throw new Error(`Failed to fetch RÚIAN download page: ${response.status}`);
  }
  const html = await response.text();
  const match = html.match(LINK_ID_REGEX);
  if (!match?.[1]) {
    throw new Error("Could not find CSV download link on RÚIAN page");
  }
  logger.info({ resolvedUrl: match[1] }, "Resolved current CSV URL");
  return match[1];
}

async function findCsvDir(dataDir: string): Promise<string> {
  const csvDir = path.join(dataDir, "CSV");
  try {
    const entries = await readdir(csvDir);
    const csvFiles = entries.filter((entry) => entry.toLowerCase().endsWith(".csv"));
    if (csvFiles.length === 0) {
      throw new Error("No CSV files found in CSV/ subdirectory after extraction");
    }
    logger.info({ fileCount: csvFiles.length }, "Found CSV files");
    return csvDir;
  } catch (err) {
    if (err instanceof Error && err.message.includes("No CSV files")) throw err;
    throw new Error(`CSV/ subdirectory not found after extraction in ${dataDir}`);
  }
}
export async function downloadRuianCsv(
  dataDir: string,
  csvUrl: string
): Promise<string> {
  const effectiveDir = dataDir || config.pipeline.dataDir;
  await mkdir(effectiveDir, { recursive: true });
  const effectiveUrl = csvUrl === "auto" ? await resolveDownloadUrl() : csvUrl;
  const absDir = path.resolve(effectiveDir);
  const zipPath = path.join(absDir, "ruian.zip");
  const startTime = Date.now();
  logger.info({ csvUrl: effectiveUrl }, "Downloading RÚIAN dataset");

  const response = await fetch(effectiveUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download RÚIAN CSV: ${response.status} ${response.statusText}`);
  }
  const contentLength = response.headers.get("content-length");
  const webStream = response.body as WebReadableStream<Uint8Array>;
  await pipeline(Readable.fromWeb(webStream), createWriteStream(zipPath));
  const zipStat = await stat(zipPath);
  const durationMs = Date.now() - startTime;
  logger.info(
    {
      durationMs,
      sizeBytes: zipStat.size,
      contentLength: contentLength ? parseInt(contentLength, 10) : undefined,
    },
    "Download complete"
  );
  logger.info("Extracting ZIP");
  execSync(`unzip -o "${zipPath}" -d "${absDir}"`);
  const csvDir = await findCsvDir(effectiveDir);
  logger.info({ csvDir }, "CSV directory ready");
  return csvDir;
}