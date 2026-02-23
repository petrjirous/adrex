import type { Context, Next } from "hono";
import { config } from "../lib/config.js";

function extractApiKey(c: Context): string | null {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const queryKey = c.req.query("apiKey");
  return queryKey ?? null;
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  if (c.req.path === "/health" && c.req.method === "GET") {
    return next();
  }

  const key = extractApiKey(c);
  if (!key || !config.api.keys.includes(key)) {
    return c.json({ error: "Invalid or missing API key" }, 401);
  }

  c.set("apiKey", key);
  return next();
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60_000);

export async function rateLimitMiddleware(c: Context, next: Next): Promise<Response | void> {
  if (c.req.path === "/health") {
    return next();
  }

  const key = extractApiKey(c) ?? c.req.header("x-forwarded-for") ?? "anonymous";
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + config.rateLimit.windowMs };
    rateLimitStore.set(key, entry);
  }

  entry.count++;

  if (entry.count > config.rateLimit.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    c.header("Retry-After", String(retryAfter));
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  return next();
}

export async function corsMiddleware(c: Context, next: Next): Promise<Response | void> {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  return next();
}
