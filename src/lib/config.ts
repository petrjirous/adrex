import "dotenv/config";

export const config = {
  meili: {
    url: process.env.MEILI_URL || "http://localhost:7700",
    masterKey: process.env.MEILI_MASTER_KEY || "adrex-dev-master-key",
    indexName: "addresses",
  },
  api: {
    port: parseInt(process.env.API_PORT || "3100", 10),
    host: process.env.API_HOST || "0.0.0.0",
    keys: (process.env.API_KEYS || "dev-test-key-1")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  },
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  },
  pipeline: {
    dataDir: process.env.RUIAN_DATA_DIR || "./data",
    csvUrl: process.env.RUIAN_CSV_URL || "auto",
    batchSize: parseInt(process.env.PIPELINE_BATCH_SIZE || "10000", 10),
  },
} as const;
