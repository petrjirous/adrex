import type { Handler } from "hono";
import { getMeiliClient } from "../../lib/meilisearch.js";

export const healthHandler: Handler = async (c) => {
  let meili: "connected" | "error" = "connected";

  try {
    await getMeiliClient().health();
  } catch {
    meili = "error";
  }

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    meili,
  });
};
