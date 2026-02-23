# adrex

Self-hosted Czech address autocomplete powered by 3M+ RÚIAN address points.

## Features

- Autocomplete API with sub-100ms response times
- JavaScript widget -- drop into any HTML form via CSS classes
- 3,012,907 Czech address points from official RÚIAN registry
- Full address validation endpoint
- Docker Compose deployment
- Zero external API dependencies -- all data is local

## Quick Start

### Prerequisites

- Docker + Docker Compose
- Node.js 22+
- `unzip` (for extracting RÚIAN data)

### 1. Clone and install

```bash
git clone https://github.com/your-username/adrex.git
cd adrex
npm install
```

### 2. Start Meilisearch

```bash
docker compose up -d meilisearch
```

### 3. Import addresses (~3M records, takes a few minutes)

```bash
npm run pipeline
```

### 4. Start the API server

```bash
npm run dev
```

### 5. Try it

```bash
curl -X POST http://localhost:3100/api/v1/address/autocomplete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-test-key-1" \
  -d '{"query": "Vodičkova 30 Praha"}'
```

Or open the demo page at `http://localhost:8080/demo/index.html` (requires a static file server in the project root).

### Docker Compose (full stack)

To run both Meilisearch and the API in Docker:

```bash
docker compose up -d
```

Then run the pipeline to import data (either locally or inside the container):

```bash
# Locally (requires Node.js + npm install)
npm run pipeline

# Or inside the container
docker compose exec api node dist/pipeline.js
```

## Widget Integration

### Basic setup

```html
<script data-adrex-url="https://your-api.example.com" src="path/to/adrex.js"></script>
<script>adrex.setClientId('your-api-key');</script>
```

### CSS Classes

Add these classes to `<input>` elements to bind them to the autocomplete:

| Class | Description |
|---|---|
| `adrex-street` | Street name |
| `adrex-number` | House number (e.g. `2141/30`) |
| `adrex-street-and-number` | Combined street and number |
| `adrex-city` | City name |
| `adrex-city-extended` | City with city part (e.g. `Praha - Nové Město`) |
| `adrex-zip` | ZIP code (PSČ) |
| `adrex-whole-address` | Full formatted address (primary search input) |

### Instance grouping

Add `adrex-instance-{name}` to group fields into separate form instances (e.g., shipping and billing addresses on the same page).

### Example: Split fields

```html
<input class="adrex-street adrex-instance-shipping" placeholder="Street">
<input class="adrex-number adrex-instance-shipping" placeholder="Number">
<input class="adrex-city adrex-instance-shipping" placeholder="City">
<input class="adrex-zip adrex-instance-shipping" placeholder="ZIP">
```

### Example: Single field with auto-fill

```html
<input class="adrex-whole-address adrex-instance-billing" placeholder="Search address...">
<input class="adrex-street-and-number adrex-instance-billing" readonly>
<input class="adrex-city adrex-instance-billing" readonly>
<input class="adrex-zip adrex-instance-billing" readonly>
```

When the user selects a suggestion from the `adrex-whole-address` input, all other fields in the same instance are auto-filled.

## API Reference

### POST /api/v1/address/autocomplete

Request:

```json
{
  "query": "Vodičkova 30 Praha",
  "limit": 10,
  "filter": [
    { "type": "MUNICIPALITY_CODE", "code": "554782" }
  ]
}
```

Response:

```json
{
  "suggestions": [
    {
      "isWholeAddress": true,
      "values": {
        "adrex-street": "Vodičkova",
        "adrex-number": "2141/30",
        "adrex-street-and-number": "Vodičkova 2141/30",
        "adrex-city": "Praha",
        "adrex-city-extended": "Praha - Nové Město",
        "adrex-zip": "11000",
        "adrex-whole-address": "Vodičkova 2141/30, Nové Město, 11000 Praha"
      },
      "addressDetail": { ... }
    }
  ],
  "query": "Vodičkova 30 Praha",
  "totalHits": 1000,
  "processingTimeMs": 5
}
```

### POST /api/v1/address/validate

Request:

```json
{
  "street": "Vodičkova",
  "houseNumber": "30",
  "city": "Praha",
  "zip": "11000"
}
```

Response:

```json
{
  "result": {
    "type": "HIT",
    "addresses": [{ ... }]
  },
  "processingTimeMs": 12
}
```

Result types: `HIT`, `MANY`, `TOOMANY`, `NOTHING`, `INSUFFICIENT_DATA`.

### GET /health

No authentication required.

```json
{ "status": "ok", "timestamp": "2025-02-23T12:00:00.000Z", "meili": "connected" }
```

### Authentication

All endpoints except `/health` require a Bearer token or an `apiKey` query parameter.

```
Authorization: Bearer your-api-key
```

Or: `GET /api/v1/address/autocomplete?apiKey=your-api-key`

Configure valid keys via the `API_KEYS` environment variable (comma-separated).

## Configuration

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|---|---|---|
| `MEILI_URL` | `http://localhost:7700` | Meilisearch connection URL |
| `MEILI_MASTER_KEY` | `adrex-dev-master-key` | Meilisearch master key |
| `API_PORT` | `3100` | API server port |
| `API_HOST` | `0.0.0.0` | API server bind address |
| `API_KEYS` | `dev-test-key-1` | Comma-separated valid API keys |
| `RUIAN_DATA_DIR` | `./data` | Directory for RÚIAN downloads |
| `RUIAN_CSV_URL` | `auto` | RÚIAN CSV URL (`auto` resolves latest from ČÚZK) |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |

## Data Source

Address data comes from [RÚIAN](https://vdp.cuzk.gov.cz) (Registr územní identifikace, adres a nemovitostí), the official Czech government address registry maintained by ČÚZK.

- 3,012,907 address points
- Updated monthly
- Licensed under CC-BY 4.0 (attribution: ČÚZK)
- The pipeline auto-resolves and downloads the latest release

The `RUIAN_CSV_URL=auto` setting (default) scrapes the current download link from ČÚZK's website, so the pipeline always fetches the latest data without manual URL updates.

## Development

```bash
npm install
cd widget && npm install && cd ..
npm run dev          # API dev server with hot reload
npm run widget:dev   # Widget dev server
npm run typecheck    # Type checking
npm run build        # Build API
npm run widget:build # Build widget
```

## Architecture

```
RÚIAN CSV (3M rows) --> pipeline --> Meilisearch
                                         |
                        Hono API  <------+
                           |
                     adrex.js widget (browser)
```

- **API**: TypeScript + Hono framework
- **Search**: Meilisearch with typo tolerance and custom ranking
- **Widget**: Vanilla TypeScript, Vite IIFE bundle (~5KB gzipped, ~2.3KB)
- **Data pipeline**: Download ZIP, extract 6,258 CSVs, parse Windows-1250, transform, batch-index
- **Coordinates**: JTSK (Czech national grid) to WGS84 conversion via proj4

## License

[MIT](LICENSE)
