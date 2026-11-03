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
git clone https://github.com/petrjirous/adrex.git
cd adrex
```

### Configure and install

Copy the example environment file and install the dependencies. Do this first: Docker Compose reads `MEILI_MASTER_KEY` and `API_KEYS` from `.env`, and the pipeline needs the Node.js dependencies.

```bash
cp .env.example .env
npm install
```

Open `.env` and set `API_KEYS` to a secret value (e.g., `my-secret-token`).

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
npm run pipeline
```

During execution, you'll see progress logs. The process usually takes 2 to 5 minutes depending on your internet speed and CPU. Once finished, Meilisearch will contain a fully searchable index of all Czech addresses.

### Start the API server

The API server acts as a secure proxy between your frontend and Meilisearch. It handles authentication, rate limiting, and request validation.

Start the server:

```bash
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
    "houseNumber": "1",
    "city": "Praha",
    "zip": "11000"
  }'
```

### Explain the response structure

Autocomplete returns suggestions in this shape (the sample is illustrative, and `addressDetail` is shortened here):

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
      "addressDetail": {
        "street": "Vodičkova",
        "wholeNumber": "2141/30",
        "city": "Praha",
        "zip": "11000"
      }
    }
  ],
  "query": "Vodičkova 30 Praha",
  "totalHits": 1000,
  "processingTimeMs": 5
}
```

- `isWholeAddress`: Whether the suggestion is a complete address.
- `values`: Display values, keyed by the widget's input classes.
- `addressDetail`: The full address record. See [`AddressDetail` fields](docs/usage.md#addressdetail-fields).

Validation returns `{ result: { type, addresses }, processingTimeMs }`, where `type` is one of `HIT`, `MANY`, `TOOMANY`, `NOTHING` or `INSUFFICIENT_DATA`. See [Call validate](docs/usage.md#call-validate).

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
<form>
  <div class="row">
    <div class="col">
      <input type="text" class="adrex-street adrex-instance-checkout" placeholder="Street">
    </div>
    <div class="col">
      <input type="text" class="adrex-number adrex-instance-checkout" placeholder="Number">
    </div>
  </div>
  <div class="row">
    <div class="col">
      <input type="text" class="adrex-city adrex-instance-checkout" placeholder="City">
    </div>
    <div class="col">
      <input type="text" class="adrex-zip adrex-instance-checkout" placeholder="ZIP">
    </div>
  </div>
</form>
```

By putting the `adrex-instance-{name}` class on each input, you tell the widget that these inputs belong together. The class must be on the `<input>` itself: on a wrapping `<form>` or `<div>` it's ignored, and the inputs join the `default` instance. The widget listens on every one of these inputs, and selecting a result auto-fills all the fields in the instance.

### Example 3: Two separate forms on one page

If you have a shipping address and a billing address on the same page, use different instance names to prevent the widget from mixing them up.

```html
<h3>Shipping Address</h3>
<div>
  <input type="text" class="adrex-street adrex-instance-shipping" placeholder="Street">
  <input type="text" class="adrex-city adrex-instance-shipping" placeholder="City">
</div>

<h3>Billing Address</h3>
<div>
  <input type="text" class="adrex-street adrex-instance-billing" placeholder="Street">
  <input type="text" class="adrex-city adrex-instance-billing" placeholder="City">
</div>
```

### How auto-fill works

The widget uses the following class mappings to fill fields:

- `adrex-street`: Fills the street name.
- `adrex-number`: Fills the combined house and orientation number (e.g., "123/10").
- `adrex-street-and-number`: Fills the street and number together.
- `adrex-city`: Fills the city name.
- `adrex-city-extended`: Fills the city name including the city part (e.g., "Praha - Nové Město").
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
  theme: 'light',          // 'light' or 'dark'
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
    console.log('User selected:', suggestion.values['adrex-whole-address']);
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
    const values = suggestion.values;
    return `
      <div class="my-custom-item">
        <span class="street">${values['adrex-street']} ${values['adrex-number']}</span>
        <span class="zip-badge">${values['adrex-zip']}</span>
        <div class="city">${values['adrex-city']}</div>
      </div>
    `;
  }
});
```

### Custom empty state

Show a helpful message when no addresses are found. `renderEmpty()` receives no arguments, and its HTML goes inside the `.adrex-dropdown-empty` element.

```javascript
adrex.configure({
  renderEmpty: () => {
    return '<div>No addresses found. Please check your spelling.</div>';
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

The widget uses 14 CSS variables to control the appearance of the dropdown. You can override these in your global CSS file. The widget adds its stylesheet after yours, so use a selector more specific than `.adrex-dropdown`, such as `body .adrex-dropdown`.

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
body .adrex-dropdown {
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

For a fully custom look, override the built-in rules with more specific selectors. The elements to target are `.adrex-dropdown`, `.adrex-dropdown-item`, `.adrex-dropdown-empty` and `.highlight`. `theme: 'none'` doesn't remove the built-in styles, because they're injected at script load, before your code can call `configure()`. See [Themes](docs/configuration.md#themes).

## Part 5: Deploying to production

The repository already includes `docker-compose.prod.yml`, which runs Caddy, the API and Meilisearch. Copy `.env.prod.example` to `.env.prod`, set `DOMAIN`, a strong `MEILI_MASTER_KEY` and your `API_KEYS`, then start the stack. Caddy gets a TLS certificate automatically and serves the widget at `/widget/dist/adrex.js`.

The API already sends `Access-Control-Allow-Origin: *`, so a proxy in front of it shouldn't add its own CORS headers.

For the full steps, see [Production with Docker Compose and Caddy](docs/installation.md#production-with-docker-compose-and-caddy).

### Kubernetes deployment

For larger installations, use the manifests provided in the `k8s/` directory. The deployment consists of:

- **Meilisearch StatefulSet**: Uses a PersistentVolumeClaim (PVC) to store the address index.
- **API Deployment**: Scalable backend pods.
- **Secrets**: Store your API keys and Meilisearch master key.
- **Pipeline Job**: A Kubernetes Job that can be triggered to refresh the address data.

See [`k8s/README.md`](k8s/README.md) for the deployment steps.

## Part 6: Updating address data

The RÚIAN dataset is updated by the Czech government every month. To keep your deployment current, you need to re-run the data pipeline.

### Re-running the pipeline

In a Docker environment, you can run the pipeline inside the API container:

```bash
docker compose exec api node dist/pipeline.js
```

The pipeline is designed to be safe to run on a live system. It downloads the new data, processes it, and updates the existing Meilisearch index in-place. Because search queries remain functional during the indexing process, there is no downtime for your users.

The pipeline adds or updates addresses by `id` and doesn't delete anything, so addresses removed from RÚIAN stay in the index.

## Part 7: API reference quick guide

The API has three routes:

- `POST /api/v1/address/autocomplete` returns suggestions for a partial address.
- `POST /api/v1/address/validate` checks an address against the RÚIAN data.
- `GET /health` reports the API's status and needs no API key.

The POST routes need an API key, sent as `Authorization: Bearer <your-api-key>` or as `?apiKey=<your-api-key>`. Requests are rate limited per API key.

For requests, responses and error codes, see [Using adrex](docs/usage.md).

## Troubleshooting

### "apiKey not set" error

The widget will log a warning in the console if you haven't called `adrex.setClientId()`. Ensure this is called before the user interacts with any search fields.

### CORS errors

If the widget fails to fetch suggestions, check your browser's network tab. The API already sends `Access-Control-Allow-Origin: *`, so if you see a CORS error, check that a proxy or load balancer isn't adding a second copy of that header.

### Pipeline fails to download data

The RÚIAN CSV server can sometimes be slow or temporarily unavailable. If the pipeline fails with a timeout or connection error, wait a few minutes and try again. Ensure your server has at least 2GB of free disk space to store the temporary ZIP and extracted CSVs.

### Meilisearch not healthy

If `/health` shows `"meili": "error"`, or searches return a 503 error, check the status of your Docker containers.

```bash
docker compose ps
```

If Meilisearch is running but unreachable, check the `MEILI_URL` and `MEILI_MASTER_KEY` in your `.env` file. They must match the values used when starting the Meilisearch container.

For more errors and their fixes, see [Troubleshooting](docs/troubleshooting.md).
