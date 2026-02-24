# adrex Deployment and Integration Tutorial

This guide provides a walk-through for setting up adrex, from local development to a production-ready environment with the search widget integrated into your website.

## Table of Contents

- [Introduction](#introduction)
- [Part 1: Running adrex locally](#part-1-running-adrex-locally)
- [Part 2: Adding the widget to your website](#part-2-adding-the-widget-to-your-website)
- [Part 3: Customizing the widget](#part-3-customizing-the-widget)
- [Part 4: Theming and styling](#part-4-theming-and-styling)
- [Part 5: Deploying to production](#part-5-deploying-to-production)
- [Part 6: Updating address data](#part-6-updating-address-data)
- [Part 7: API reference quick guide](#part-7-api-reference-quick-guide)
- [Troubleshooting](#troubleshooting)

## Introduction

adrex is a lightweight, high-performance address search and validation engine specifically designed for Czech addresses. It provides a real-time autocomplete widget and a REST API backed by the official RÚIAN dataset from the State Administration of Land Surveying and Cadastre (ČÚZK).

In this tutorial, you'll learn how to deploy the backend services using Docker, process millions of official address records, and integrate a customizable search widget into your frontend.

### Prerequisites

Before starting, ensure you have the following tools installed:

- **Docker and Docker Compose**: For running Meilisearch and the API server.
- **Node.js 22+**: For running the data pipeline and development scripts.
- **unzip**: Needed by the pipeline to extract the RÚIAN data package.
- **curl**: To test the API endpoints from your terminal.

## Part 1: Running adrex locally

The first step is setting up the backend infrastructure and indexing the address data.

### Clone the repo

Start by cloning the adrex repository to your local machine:

```bash
git clone https://github.com/your-repo/adrex.git
cd adrex
```

### Start Meilisearch with docker compose

adrex uses Meilisearch as its primary search engine. It's fast, typo-tolerant, and easy to manage. Use the provided `docker-compose.yml` to start it:

```bash
docker compose up -d meilisearch
```

Verify that Meilisearch is running on `http://localhost:7700`. You can check the health status with a simple GET request:

```bash
curl http://localhost:7700/health
```

The response should be:

```json
{
  "status": "available"
}
```

### Run the data pipeline

The data pipeline is a crucial part of adrex. It performs several heavy lifting tasks:

1.  Downloads a 60MB ZIP file containing the latest RÚIAN data from ČÚZK.
2.  Extracts 6,258 CSV files encoded in Windows-1250.
3.  Parses approximately 3 million address records.
4.  Normalizes the data and indexes it into Meilisearch.

Run the pipeline using the following command:

```bash
npm run pipeline:run
```

During execution, you'll see progress logs. The process usually takes 2 to 5 minutes depending on your internet speed and CPU. Once finished, Meilisearch will contain a fully searchable index of all Czech addresses.

### Start the API server

The API server acts as a secure proxy between your frontend and Meilisearch. It handles authentication, rate limiting, and request validation.

Copy the example environment file and configure your keys:

```bash
cp .env.example .env
```

Open `.env` and set `API_KEYS` to a secret value (e.g., `my-secret-token`). Then start the server:

```bash
npm install
npm run dev
```

The server will start on `http://localhost:3100`.

### Test with curl

You can now test the autocomplete and validation endpoints.

**Autocomplete test:**

```bash
curl -X POST http://localhost:3100/api/v1/address/autocomplete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-secret-token" \
  -d '{"query": "Václavské nám"}'
```

**Validation test:**

```bash
curl -X POST http://localhost:3100/api/v1/address/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-secret-token" \
  -d '{
    "street": "Václavské náměstí",
    "number": "1",
    "city": "Praha",
    "zip": "11000"
  }'
```

### Explain the response structure

The API returns a standardized JSON structure for address suggestions:

```json
{
  "suggestions": [
    {
      "id": "21707936",
      "street": "Václavské náměstí",
      "houseNumber": "1",
      "orientationNumber": null,
      "city": "Praha",
      "cityDistrict": "Nové Město",
      "zip": "11000",
      "formatted": "Václavské náměstí 1, 11000 Praha-Nové Město"
    }
  ]
}
```

- `id`: The official RÚIAN code for the address.
- `houseNumber`: The primary building number (číslo popisné).
- `orientationNumber`: The secondary street number (číslo orientační), if applicable.
- `formatted`: A pre-built string suitable for display in search results.

## Part 2: Adding the widget to your website

The adrex widget is a tiny, zero-dependency JavaScript library that turns standard HTML inputs into powerful address search fields.

### Copy the widget script

Locate the bundled widget at `widget/dist/adrex.js`. It's approximately 10KB (3.4KB gzipped). Copy this file to your project's static assets directory.

### Basic script tag setup

Include the script at the end of your HTML body. You must provide the `data-adrex-url` attribute to tell the widget where your API is located.

```html
<script 
  src="/js/adrex.js" 
  data-adrex-url="http://localhost:3100"
  defer
></script>

<script>
  window.addEventListener('load', () => {
    adrex.setClientId('my-secret-token');
  });
</script>
```

### Example 1: Single search input

If you only need a single field that captures the entire address, use the `adrex-whole-address` class.

```html
<div class="form-group">
  <label for="address">Full Address</label>
  <input type="text" id="address" class="adrex-whole-address" placeholder="Start typing your address...">
</div>
```

When a user selects a suggestion, the input's value will be updated to the full formatted address string.

### Example 2: Split fields form

In most e-commerce checkouts, you need the address split into separate fields for the database. adrex handles this automatically by looking for specific classes.

```html
<form class="adrex-instance-checkout">
  <div class="row">
    <div class="col">
      <input type="text" class="adrex-street" placeholder="Street">
    </div>
    <div class="col">
      <input type="text" class="adrex-number" placeholder="Number">
    </div>
  </div>
  <div class="row">
    <div class="col">
      <input type="text" class="adrex-city" placeholder="City">
    </div>
    <div class="col">
      <input type="text" class="adrex-zip" placeholder="ZIP">
    </div>
  </div>
</form>
```

By wrapping the fields in a container with the `adrex-instance-{name}` class, you tell the widget that these inputs belong together. The search logic will be attached to the street field by default, and selecting a result will auto-fill all other fields in that same container.

### Example 3: Two separate forms on one page

If you have a shipping address and a billing address on the same page, use different instance names to prevent the widget from mixing them up.

```html
<h3>Shipping Address</h3>
<div class="adrex-instance-shipping">
  <input type="text" class="adrex-street" placeholder="Street">
  <input type="text" class="adrex-city" placeholder="City">
</div>

<h3>Billing Address</h3>
<div class="adrex-instance-billing">
  <input type="text" class="adrex-street" placeholder="Street">
  <input type="text" class="adrex-city" placeholder="City">
</div>
```

### How auto-fill works

The widget uses the following class mappings to fill fields:

- `adrex-street`: Fills the street name.
- `adrex-number`: Fills the combined house and orientation number (e.g., "123/10").
- `adrex-city`: Fills the city name.
- `adrex-city-extended`: Fills the city name including the district (e.g., "Praha-Nové Město").
- `adrex-zip`: Fills the 5-digit postal code.
- `adrex-whole-address`: Fills the full formatted address.

## Part 3: Customizing the widget

You can modify the widget's behavior through global or instance-specific configuration.

### Global configuration

Use `adrex.configure()` to set defaults for all instances on the page.

```javascript
adrex.configure({
  debounce: 250,           // Debounce time in milliseconds (default: 250)
  minChars: 2,             // Min characters before searching (default: 2)
  maxSuggestions: 5,       // Maximum items to show in dropdown (default: 8)
  theme: 'light',          // 'light', 'dark', or 'none'
  noResultsText: 'No addresses found'
});
```

### Per-instance overrides

If one specific form needs different settings, you can target its instance directly.

```javascript
const shipping = adrex.getInstance('shipping');

shipping.configure({
  maxSuggestions: 10,
  noResultsText: 'No delivery addresses found'
});
```

### Callbacks

Callbacks allow you to react to user actions or handle errors gracefully.

```javascript
adrex.configure({
  onSelect: (suggestion, instance) => {
    console.log('User selected:', suggestion.formatted);
    // You could trigger a shipping cost recalculation here
  },
  onSuggest: (suggestions) => {
    console.log(`Found ${suggestions.length} matches`);
  },
  onError: (error) => {
    console.error('Adrex API error:', error.message);
  }
});
```

### Custom rendering

If the default dropdown layout doesn't fit your design, you can provide a custom render function for the suggestions.

```javascript
adrex.configure({
  renderSuggestion: (suggestion) => {
    return `
      <div class="my-custom-item">
        <span class="street">${suggestion.street} ${suggestion.houseNumber}</span>
        <span class="zip-badge">${suggestion.zip}</span>
        <div class="city">${suggestion.city}</div>
      </div>
    `;
  }
});
```

### Custom empty state

Show a helpful message when no addresses are found.

```javascript
adrex.configure({
  renderEmpty: (query) => {
    return `<div class="adrex-empty">No addresses found for "${query}". Please check your spelling.</div>`;
  }
});
```

## Part 4: Theming and styling

adrex comes with two built-in themes and a flexible system for custom styling using CSS variables.

### Built-in themes

The `light` theme (default) is designed for white or light-gray backgrounds. The `dark` theme works well for modern dark-mode interfaces.

```javascript
adrex.configure({ theme: 'dark' });
```

### CSS Custom Properties

The widget uses 13 CSS variables to control the appearance of the dropdown. You can override these in your global CSS file.
| Property | Description | Default (Light) |
| :--- | :--- | :--- |
| `--adrex-dropdown-bg` | Background color of the dropdown | #ffffff |
| `--adrex-dropdown-border` | Border shorthand | 1px solid #cccccc |
| `--adrex-dropdown-shadow` | Drop shadow for depth | 0 4px 6px rgba(0,0,0,0.1) |
| `--adrex-dropdown-radius` | Corner rounding | 4px |
| `--adrex-dropdown-max-height` | Maximum dropdown height | 300px |
| `--adrex-dropdown-font-family` | Font family | inherit |
| `--adrex-dropdown-font-size` | Base text size | 14px |
| `--adrex-dropdown-text-color` | Default text color | #333333 |
| `--adrex-item-padding` | Spacing inside each suggestion | 8px 12px |
| `--adrex-item-hover-bg` | Background when hovered | #e8f0fe |
| `--adrex-item-active-bg` | Background when active/selected | #e8f0fe |
| `--adrex-highlight-color` | Color of matched query text | inherit |
| `--adrex-highlight-weight` | Font weight of matched text | bold |
| `--adrex-empty-color` | Color for the "no results" message | #777777 |

### Creating a custom theme

To create a completely unique look, define your own styles.

```css
/* Custom "Corporate Blue" Theme */
.adrex-dropdown {
  --adrex-dropdown-bg: #f0f4f8;
  --adrex-dropdown-text-color: #1a365d;
  --adrex-dropdown-border: 1px solid #2b6cb0;
  --adrex-highlight-color: #3182ce;
  --adrex-item-hover-bg: #ebf8ff;
  --adrex-dropdown-radius: 8px;
  --adrex-dropdown-font-family: "Inter", sans-serif;
}
```

### Dark mode setup

If your website supports a dark mode toggle, you can update the adrex theme dynamically using JavaScript.

```javascript
function toggleDarkMode(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  adrex.configure({ theme: isDark ? 'dark' : 'light' });
}
```

Alternatively, if you use a fully custom CSS approach, set `theme: 'none'` in the configuration. This removes all default colors and borders, letting you style the `.adrex-dropdown` and `.adrex-item` classes from scratch.

## Part 5: Deploying to production

When moving to production, you should use Docker to ensure a consistent environment.

### Docker Compose deployment

Create a `docker-compose.prod.yml` file. It's vital to set a strong `MEILI_MASTER_KEY` and restrict `API_KEYS`.

```yaml
version: '3.8'

services:
  meilisearch:
    image: getmeili/meilisearch:v1.12
    environment:
      - MEILI_MASTER_KEY=${MEILI_MASTER_KEY}
      - MEILI_ENV=production
    volumes:
      - ./data/meili:/meili_data
    restart: always

  api:
    build: .
    ports:
      - "3100:3100"
    environment:
      - MEILI_URL=http://meilisearch:7700
      - MEILI_MASTER_KEY=${MEILI_MASTER_KEY}
      - API_KEYS=${PROD_API_KEYS}
      - RATE_LIMIT_MAX=100
      - RATE_LIMIT_WINDOW_MS=60000
    depends_on:
      - meilisearch
    restart: always
```

### Nginx reverse proxy

You should never expose the API port directly to the internet. Use Nginx to handle SSL and CORS headers.

```nginx
server {
    listen 443 ssl;
    server_name adrex-api.your-domain.example.com;

    location / {
        proxy_pass http://localhost:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # Basic CORS setup
        add_header 'Access-Control-Allow-Origin' 'https://your-website.example.com' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type' always;

        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }
}
```

### Kubernetes deployment

For larger installations, use the manifests provided in the `k8s/` directory. The deployment consists of:

- **Meilisearch StatefulSet**: Uses a PersistentVolumeClaim (PVC) to store the address index.
- **API Deployment**: Scalable backend pods.
- **Secrets**: Store your API keys and Meilisearch master key.
- **Pipeline Job**: A Kubernetes Job that can be triggered to refresh the address data.

## Part 6: Updating address data

The RÚIAN dataset is updated by the Czech government every month. To keep your deployment current, you need to re-run the data pipeline.

### Re-running the pipeline

In a Docker environment, you can run the pipeline inside the API container:

```bash
docker compose exec api npm run pipeline:run
```

The pipeline is designed to be safe to run on a live system. It downloads the new data, processes it, and updates the existing Meilisearch index in-place. Because search queries remain functional during the indexing process, there is no downtime for your users.

## Part 7: API reference quick guide

### POST /api/v1/address/autocomplete

Finds address suggestions based on a partial query string.

**Request Body:**

```json
{
  "query": "string",
  "limit": 5
}
```

**Successful Response (200 OK):**

```json
{
  "suggestions": [
    {
      "id": "21707936",
      "street": "Václavské náměstí",
      "houseNumber": "1",
      "orientationNumber": null,
      "city": "Praha",
      "zip": "11000",
      "formatted": "Václavské náměstí 1, 11000 Praha"
    }
  ]
}
```

### POST /api/v1/address/validate

Checks if a specific address exists in the RÚIAN database.

**Request Body:**

```json
{
  "street": "Václavské náměstí",
  "number": "1",
  "city": "Praha",
  "zip": "11000"
}
```

**Response (200 OK):**

```json
{
  "valid": true,
  "match": {
    "id": "21707936",
    "score": 1.0
  }
}
```

### Authentication

The API requires a Bearer token in the `Authorization` header.

```http
Authorization: Bearer <your-api-key>
```

Alternatively, for simple widget integrations, you can pass the key as a query parameter (though this is less secure): `?apiKey=<your-api-key>`.

### Rate Limiting

By default, the API limits requests to prevent abuse. You can tune this in your `.env` file:

- `RATE_LIMIT_MAX`: Max number of requests per window.
- `RATE_LIMIT_WINDOW_MS`: The window size in milliseconds.

## Troubleshooting

### "apiKey not set" error

The widget will display an error in the console if you haven't called `adrex.setClientId()`. Ensure this is called before the user interacts with any search fields.

### CORS errors

If the widget fails to fetch suggestions, check your browser's network tab. If you see a CORS error, verify that your API server is sending the correct `Access-Control-Allow-Origin` headers. In production, this is typically handled by Nginx or your load balancer.

### Pipeline fails to download data

The RÚIAN CSV server can sometimes be slow or temporarily unavailable. If the pipeline fails with a timeout or connection error, wait a few minutes and try again. Ensure your server has at least 2GB of free disk space to store the temporary ZIP and extracted CSVs.

### Meilisearch not healthy

If the API logs show "Meilisearch connection failed", check the status of your Docker containers.

```bash
docker compose ps
```

If Meilisearch is running but unreachable, check the `MEILI_URL` and `MEILI_MASTER_KEY` in your `.env` file. They must match the values used when starting the Meilisearch container.

### Debug logging

To see more detailed logs from the API server, set the `LOG_LEVEL` environment variable to `debug`:

```bash
LOG_LEVEL=debug npm run dev
```

This will output every incoming request and the raw queries sent to Meilisearch, which is helpful for diagnosing search quality issues.
