import { serve } from "@hono/node-server";
import { Hono } from "hono";
import pino from "pino";
import { config } from "./lib/config.js";
import { corsMiddleware, authMiddleware, rateLimitMiddleware } from "./api/middleware.js";
import { healthHandler } from "./api/handlers/health.js";
import { autocompleteHandler } from "./api/handlers/autocomplete.js";
import { validateHandler } from "./api/handlers/validate.js";

const logger = pino({
  name: "server",
  transport: { target: "pino-pretty" },
});

const app = new Hono();

app.use("*", corsMiddleware);
app.use("*", authMiddleware);
app.use("*", rateLimitMiddleware);

app.get("/health", healthHandler);
app.post("/api/v1/address/autocomplete", autocompleteHandler);
app.post("/api/v1/address/validate", validateHandler);

app.notFound((c) => c.json({ error: "Not found" }, 404));

serve(
  { fetch: app.fetch, hostname: config.api.host, port: config.api.port },
  (info) => {
    logger.info(
      { host: config.api.host, port: info.port },
      "Adrex API server started"
    );
  }
);
