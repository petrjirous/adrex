# Installing adrex

This guide takes you from a fresh clone to a working API, then on to production. If something fails along the way, see [Troubleshooting](troubleshooting.md).

## Prerequisites

- Docker and Docker Compose
- Node.js 22 or later
- `unzip`, used by the pipeline to extract the RÚIAN data
- `curl`, to test the API

The pipeline downloads about 60 MB and extracts 6,258 CSV files. Allow at least 2 GB of free disk space for the ZIP and the CSVs.

> **TBD:** The minimum RAM and the disk size for the Meilisearch index on a single host. The only figures in the repo are the Kubernetes values: 1Gi requested, a 4Gi limit and a 20Gi volume for Meilisearch.

## Local setup

### 1. Clone, configure and install

```bash
git clone https://github.com/petrjirous/adrex.git
cd adrex
cp .env.example .env
npm install
```

Don't skip the `.env` step. `docker-compose.yml` needs `MEILI_MASTER_KEY` and `API_KEYS` from `.env` and won't start without them. `.env` also provides the `dev-test-key-1` key used in the examples below.

For every available setting, see [Environment variables](configuration.md#environment-variables).

### 2. Start Meilisearch

```bash
docker compose up -d meilisearch
```

Check that it's running:

```bash
curl http://localhost:7700/health
```

```json
{
  "status": "available"
}
```

### 3. Import the data

```bash
npm run pipeline
```

This downloads the latest RÚIAN data, extracts it and indexes about 3 million address points, which takes a few minutes. The last log line contains `Pipeline finished`.

See [Import and refresh data](usage.md#import-and-refresh-data) for the expected output and the other import modes.

### 4. Start the API

```bash
npm run dev
```

The server listens on `http://localhost:3100` and logs a line containing `Adrex API server started`.

## Check the install

First check the health endpoint. It needs no API key:

```bash
curl http://localhost:3100/health
```

The output below is illustrative. Your timestamp will differ:

```json
{
  "status": "ok",
  "timestamp": "2025-02-23T12:00:00.000Z",
  "meili": "connected"
}
```

Look at `meili`, not `status`. `status` stays `"ok"` even when Meilisearch is down, and `meili` then shows `"error"`.

Then run a test search:

```bash
curl -X POST http://localhost:3100/api/v1/address/autocomplete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-test-key-1" \
  -d '{"query": "Vodičkova 30 Praha"}'
```

The install works if the response has a non-empty `suggestions` array. [Call autocomplete](usage.md#call-autocomplete) shows the full response.

To see the demo page, serve the repository root with any static file server on port 8080 and open `http://localhost:8080/demo/index.html`. Locally, the demo uses `dev-test-key-1`, so keep that key in `API_KEYS`.

## Run the full stack in Docker

To run the API in Docker as well, start everything after completing step 1:

```bash
docker compose up -d
```

Then import the data, either from your machine or inside the container:

```bash
# From your machine (needs npm install)
npm run pipeline

# Or inside the container
docker compose exec api node dist/pipeline.js
```

The `data/` folder is mounted into the container, so downloads are shared between the two. Not every setting reaches the container, as described in [Where each variable applies](configuration.md#where-each-variable-applies).

## Production with Docker Compose and Caddy

`docker-compose.prod.yml` runs Caddy, the API and Meilisearch. Caddy gets a TLS certificate from Let's Encrypt automatically. These steps come from the repository files and haven't been run as part of writing this guide.

### 1. Prepare the server

Install Docker on the server, and open ports 80 and 443. Create an A record that points your domain at the server:

```text
adrex.yourdomain.com  →  A  →  YOUR_SERVER_IP
```

### 2. Clone and configure

```bash
git clone https://github.com/petrjirous/adrex.git
cd adrex
cp .env.prod.example .env.prod
```

Edit `.env.prod`:

```env
DOMAIN=adrex.yourdomain.com
MEILI_MASTER_KEY=<generate with: openssl rand -base64 32>
API_KEYS=demo-public-key,your-private-key
```

The demo page uses `demo-public-key` in production, so keep that key if you want the demo to work.

`.gitignore` doesn't cover `.env.prod`, so take care not to commit it.

### 3. Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 4. Import the data

```bash
docker compose -f docker-compose.prod.yml exec api node dist/pipeline.js
```

This takes 10–15 minutes, depending on the server. Meilisearch has no published port in production, so run the pipeline inside the container.

### 5. Verify

```bash
curl https://adrex.yourdomain.com/health

curl -X POST https://adrex.yourdomain.com/api/v1/address/autocomplete \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer demo-public-key' \
  -d '{"query": "Vodičkova 30 Praha"}'
```

Expect the same results as in [Check the install](#check-the-install).

### What Caddy serves

| Path | Served by |
|---|---|
| `/api/*` | The API |
| `/health` | The API |
| `/widget/*` | Static files, so the bundle is at `/widget/dist/adrex.js` |
| Everything else | The demo page |

### Day-to-day operations

```bash
# Update to the latest code
git pull && docker compose -f docker-compose.prod.yml up -d --build

# Follow the logs
docker compose -f docker-compose.prod.yml logs -f
```

Meilisearch data is stored in the `meili_data` Docker volume, so it survives container restarts. The API service has no data volume, so downloaded CSV files are lost when its container is recreated.

## Kubernetes

The `k8s/` folder has manifests for the API, Meilisearch and the import job. Follow [`k8s/README.md`](../k8s/README.md) to deploy them.

Before you start, read [Pods are refused with `runAsNonRoot`](troubleshooting.md#pods-are-refused-with-runasnonroot). It describes a likely start-up problem with these manifests.

The Ingress in `k8s/ingress.yaml` routes everything to the API, so it doesn't serve the widget bundle or the demo page. Host `adrex.js` yourself and set `data-adrex-url`.

## Next steps

- [Using adrex](usage.md): call the API and add the widget to a page.
- [Configuring adrex](configuration.md): every setting and widget option.
