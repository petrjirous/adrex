# adrex

Self-hosted Czech address autocomplete powered by 3M+ RÚIAN address points.

## Features

- Autocomplete API with sub-100ms response times
- JavaScript widget — drop into any HTML form via CSS classes
- 3,012,907 Czech address points from official RÚIAN registry
- Full address validation endpoint
- Docker Compose deployment
- Zero external API dependencies — all data is local

## Quick Start

### Prerequisites

- Docker + Docker Compose
- Node.js 22+ (for development)

### 1. Start services

docker compose up -d

### 2. Import addresses

npm run pipeline

### 3. Try it

curl -X POST http://localhost:3100/api/v1/address/autocomplete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-test-key-1" \
  -d '{"query": "Vodičkova 30 Praha"}'

## Widget Integration

### Basic setup

<script data-adrex-url="https://your-api.example.com" src="path/to/adrex.js"></script>
<script>adrex.setClientId('your-api-key');</script>

### CSS Classes

Available CSS classes:

- adrex-street: Target for street name
- adrex-number: Target for house number
- adrex-street-and-number: Combined street and number
- adrex-city: Target for city name
- adrex-city-extended: City name with city part (e.g., Praha - Nové Město)
- adrex-zip: Target for ZIP code (PSČ)
- adrex-whole-address: Main input for searching or full address representation

### Instance grouping

- adrex-instance-{name}: Use this class to group fields into separate form instances (e.g., shipping and billing)

### Example: Split fields

<input class="adrex-street adrex-instance-shipping" placeholder="Street">
<input class="adrex-number adrex-instance-shipping" placeholder="Number">
<input class="adrex-city adrex-instance-shipping" placeholder="City">
<input class="adrex-zip adrex-instance-shipping" placeholder="ZIP">

### Example: Single field with auto-fill

<input class="adrex-whole-address adrex-instance-billing" placeholder="Search address...">
<input class="adrex-street-and-number adrex-instance-billing" readonly>
<input class="adrex-city adrex-instance-billing" readonly>
<input class="adrex-zip adrex-instance-billing" readonly>

## API Reference

### POST /api/v1/address/autocomplete

Request:
```json
{
  "query": "string",
  "limit": 10,
  "filter": [
    { "type": "MUNICIPALITY_CODE", "code": "554782" }
  ]
}
```

Response:
```json
{
  "suggestions": [...],
  "query": "Vodičkova 30",
  "totalHits": 1,
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
  "zip": "11000",
  "wholeAddress": "Vodičkova 30, 11000 Praha"
}
```

Response:
```json
{
  "result": {
    "type": "HIT",
    "addresses": [...]
  },
  "processingTimeMs": 12
}
```

Types for `type`: `HIT`, `MANY`, `TOOMANY`, `NOTHING`, `INSUFFICIENT_DATA`.

### GET /health

No authentication required.

Returns:
```json
{
  "status": "ok",
  "timestamp": "2025-02-23T12:00:00.000Z",
  "meili": "connected"
}
```

### Authentication

All endpoints except `/health` require a Bearer token or an `apiKey` query parameter. Configure valid keys via the `API_KEYS` environment variable (comma-separated).

## Configuration

Configure the application via environment variables or a `.env` file:

- `MEILI_URL`: Meilisearch connection string (default: http://localhost:7700)
- `MEILI_MASTER_KEY`: Master key for Meilisearch authentication
- `API_PORT`: Port for the API server (default: 3100)
- `API_HOST`: Host for the API server (default: 0.0.0.0)
- `API_KEYS`: Comma-separated list of valid API keys
- `RUIAN_DATA_DIR`: Directory for storing RÚIAN data (default: ./data)
- `RUIAN_CSV_URL`: URL for RÚIAN CSV download (default: auto — resolves latest from ČÚZK)
- `RATE_LIMIT_MAX`: Max requests per window (default: 100)
- `RATE_LIMIT_WINDOW_MS`: Rate limit window in milliseconds (default: 60000)

## Data Source

- RÚIAN (Registr územní identifikace, adres a nemovitostí): Official Czech government address registry
- 3,012,907 address points provided under CC-BY 4.0 license
- Updated monthly by ČÚZK
- The pipeline automatically resolves and downloads the latest data release

## Development

```bash
npm install
cd widget && npm install && cd ..
npm run dev          # API development server with hot reload
npm run widget:dev   # Widget development server
npm run typecheck    # Type checking
npm run build        # Build API
npm run widget:build # Build widget
```

## Architecture

- API: TypeScript using the Hono framework
- Search: Powered by Meilisearch for fast typo-tolerant lookup
- Widget: Vanilla TypeScript bundled into a ~5KB gzipped IIFE using Vite
- Data: Pipeline processes RÚIAN CSV files, transforms them, and indexes into Meilisearch
- Coordinates: Handles conversion from JTSK (Czech national grid) to WGS84 via proj4

## License

MIT
