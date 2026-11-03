# Configuring adrex

This page lists every option adrex has. For step-by-step setup, see [Installing adrex](installation.md). For worked examples, see [Using adrex](usage.md).

## Environment variables

Local `npm` commands read these from `.env` in the current directory. Start from the template:

```bash
cp .env.example .env
```

| Name | Type | Default | Description |
|---|---|---|---|
| `MEILI_URL` | URL | `http://localhost:7700` | Meilisearch connection URL. Both Compose files and the Kubernetes manifests set this for you. |
| `MEILI_MASTER_KEY` | string | empty | Meilisearch master key. The application falls back to an empty key, but `docker-compose.yml` refuses to start without one. `.env.example` sets `adrex-dev-master-key`. |
| `API_PORT` | integer | `3100` | Port the API listens on. See [Where each variable applies](#where-each-variable-applies) before changing it in Docker. |
| `API_HOST` | string | `0.0.0.0` | Address the API binds to. |
| `API_KEYS` | comma-separated strings | empty | Valid API keys. Spaces around keys are trimmed. If this is empty, every API request except `GET /health` gets a 401. `.env.example` sets `dev-test-key-1,dev-test-key-2`. |
| `RUIAN_DATA_DIR` | path | `./data` | Directory for the downloaded `ruian.zip` and the extracted `CSV/` folder. |
| `RUIAN_CSV_URL` | URL or `auto` | `auto` | Where the RÚIAN ZIP comes from. `auto` finds the current link on the ČÚZK download page. Any other value is used as a direct download URL. |
| `PIPELINE_BATCH_SIZE` | integer | `10000` | Number of documents the pipeline sends to Meilisearch per batch. |
| `RATE_LIMIT_MAX` | integer | `100` | Requests allowed per API key in each window. |
| `RATE_LIMIT_WINDOW_MS` | integer | `60000` | Length of the rate limit window in milliseconds. |
| `DOMAIN` | hostname | none | Production only, set in `.env.prod`. Caddy uses it as the site address (`{$DOMAIN}` in `Caddyfile`) and requests its TLS certificate for it. The API doesn't read it. |

The Compose files and manifests also set `MEILI_ENV`, and the Kubernetes StatefulSet sets `MEILI_NO_ANALYTICS`. Those are read by Meilisearch, not by adrex.

### Where each variable applies

Not every variable reaches every environment:

- **Local `npm` commands:** all variables in `.env` apply, except `DOMAIN`, which nothing reads locally.
- **`docker-compose.yml`:**
  - The `api` container only receives `MEILI_MASTER_KEY`, `API_KEYS`, `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` from `.env`.
  - `MEILI_URL`, `API_HOST` and the in-container `API_PORT` are fixed. `API_PORT` in `.env` only changes the published host port.
  - `RUIAN_DATA_DIR`, `RUIAN_CSV_URL` and `PIPELINE_BATCH_SIZE` aren't passed in, so `docker compose exec api node dist/pipeline.js` uses their defaults. To override one, pass it on the command line, for example `docker compose exec -e PIPELINE_BATCH_SIZE=5000 api node dist/pipeline.js`.
- **`docker-compose.prod.yml`:**
  - All services read everything in `.env.prod`, and `MEILI_URL` is fixed for the `api` service.
  - Keep `API_PORT` at `3100`, because `Caddyfile` proxies to `api:3100`.
- **Kubernetes:** containers only receive the variables listed in their manifest. The API gets `MEILI_URL`, `MEILI_MASTER_KEY`, `API_KEYS`, `API_PORT` and `API_HOST`, so the rate limit runs on its defaults.

## Pipeline flags

Pass these to `src/pipeline.ts` (or `dist/pipeline.js` in a container). The npm scripts below already include them.

| Name | Type | Default | Description |
|---|---|---|---|
| `--download-only` | flag | off | Download and extract the RÚIAN data, then stop without touching Meilisearch. |
| `--index-only` | flag | off | Skip the download and index the CSV files already in `RUIAN_DATA_DIR/CSV`. Fails if that folder has no `.csv` files. |

With neither flag, the pipeline downloads and then indexes. With both flags, it only checks that the CSV folder exists: nothing is downloaded or indexed.

## npm scripts

These come from `package.json`. Run them with `npm run <name>`, for example `npm run pipeline`.

| Name | Type | Default | Description |
|---|---|---|---|
| `dev` | npm script | n/a | Start the API with hot reload (`tsx watch src/server.ts`). |
| `build` | npm script | n/a | Build the API and the pipeline into `dist/`. |
| `start` | npm script | n/a | Run the built API (`node dist/server.js`). |
| `pipeline` | npm script | n/a | Download the RÚIAN data and index it. |
| `pipeline:download` | npm script | n/a | Run the pipeline with `--download-only`. |
| `pipeline:index` | npm script | n/a | Run the pipeline with `--index-only`. |
| `typecheck` | npm script | n/a | Type-check the API with `tsc --noEmit`. |
| `widget:dev` | npm script | n/a | Start the widget dev server. Needs `npm install` in `widget/` first. |
| `widget:build` | npm script | n/a | Build `widget/dist/adrex.js`. Needs `npm install` in `widget/` first. |

## Widget options

Pass these to `adrex.configure()` for all instances, or to `adrex.getInstance('name').configure()` for one instance. Options are merged, so later calls only change what they name. An instance option wins over a global option, and a global option wins over the default.

| Name | Type | Default | Description |
|---|---|---|---|
| `apiUrl` | string | detected, see [Widget script and global properties](#widget-script-and-global-properties) | Base URL of the API. Don't use a trailing slash here: only `data-adrex-url` has it removed. |
| `apiKey` | string or `null` | `null` | API key. `adrex.setClientId(key)` sets the same global value. |
| `debounce` | number (ms) | `250` | Delay after the last keystroke before the widget searches. |
| `minChars` | number | `2` | Minimum input length before the widget searches. |
| `maxSuggestions` | number | `8` | Sent to the API as `limit`, so the API's 1–50 clamp applies. |
| `theme` | `'light' \| 'dark' \| 'none'` | `'light'` | Global only: it has no effect in an instance's `configure()`. `'none'` doesn't remove the built-in styles. See [Themes](#themes). |
| `zIndex` | number | `10000` | `z-index` set on the dropdown element. |
| `onSelect` | `(suggestion, instance) => void` | `null` | Called after the user picks a suggestion and the fields are filled. |
| `onSuggest` | `(suggestions, query, instance) => void` | `null` | Called after each successful search, including one with no results. |
| `onError` | `(error, instance) => void` | `null` | Called when a search fails. Any non-2xx response arrives as a generic `Error('Network response was not ok')`, so the HTTP status isn't available here. |
| `renderSuggestion` | `(suggestion, query) => string` | `null` | Returns HTML for one dropdown item. The string goes into `innerHTML`, so escape anything you add from user input. |
| `renderEmpty` | `() => string` | `null` | Returns HTML for the empty state. It receives no arguments. If set, it replaces `noResultsText`. |
| `noResultsText` | string | `'Adresa nenalezena'` | Plain text shown when there are no results. |

## Widget script and global properties

| Name | Type | Default | Description |
|---|---|---|---|
| `data-adrex-url` | script attribute | none | API URL, set on the `<script>` tag that loads `adrex.js`. A trailing slash is removed. |
| `adrex.apiUrl` | string, read and write | detected | The detected API URL. A value set through `configure({ apiUrl })` takes priority over this property when the widget sends requests. |
| `adrex.clientId` | string or `null`, read-only | `null` | The API key set by `adrex.setClientId()` or `configure({ apiKey })`. |
| `adrex.beforeInit` | function or `null` | `null` | Hook that runs just before the widget first scans the page for inputs. |
| `adrex.afterInit` | function or `null` | `null` | Hook that runs just after that first scan. |

The widget resolves the API URL at load in this order:

1. The `data-adrex-url` attribute.
2. The origin of the script's `src`.
3. The page's origin.

Assign `beforeInit` and `afterInit` in an inline script placed right after a normal blocking `<script>` tag, so they're set before the page finishes parsing. With `defer`, the first scan runs while the script loads, so hooks assigned afterwards never run.

## Input classes

The widget binds to every `<input>` whose class contains `adrex-`. Each input also receives the matching value when a suggestion is selected.

| Name | Type | Default | Description |
|---|---|---|---|
| `adrex-street` | input class | n/a | Street name. |
| `adrex-number` | input class | n/a | House number, for example `2141/30`. |
| `adrex-street-and-number` | input class | n/a | Street and number together. |
| `adrex-city` | input class | n/a | City name. |
| `adrex-city-extended` | input class | n/a | City with its city part, for example `Praha - Nové Město`. |
| `adrex-zip` | input class | n/a | ZIP code (PSČ). |
| `adrex-whole-address` | input class | n/a | The full formatted address. |
| `adrex-instance-{name}` | input class | `default` instance | Groups inputs into a named instance. It must be on each `<input>`: the widget doesn't read classes on a wrapping `<form>` or `<div>`. |

## CSS custom properties

The built-in stylesheet defines 14 properties on `.adrex-dropdown`.

| Name | Type | Default | Description |
|---|---|---|---|
| `--adrex-dropdown-bg` | color | `#ffffff` | Dropdown background. Dark theme: `#1e1e1e`. |
| `--adrex-dropdown-border` | border | `1px solid #cccccc` | Dropdown border. Dark theme: `1px solid #444444`. |
| `--adrex-dropdown-shadow` | box shadow | `0 4px 6px rgba(0,0,0,0.1)` | Dropdown shadow. Dark theme: `0 4px 6px rgba(0,0,0,0.3)`. |
| `--adrex-dropdown-radius` | length | `4px` | Corner radius. |
| `--adrex-dropdown-max-height` | length | `300px` | Maximum height before the list scrolls. |
| `--adrex-dropdown-font-family` | font family | `inherit` | Font family. |
| `--adrex-dropdown-font-size` | length | `14px` | Font size. |
| `--adrex-dropdown-text-color` | color | `#333333` | Text color. Dark theme: `#e0e0e0`. |
| `--adrex-item-padding` | length | `8px 12px` | Padding of `.adrex-dropdown-item` and `.adrex-dropdown-empty`. |
| `--adrex-item-hover-bg` | color | `#e8f0fe` | Background of a hovered item. Dark theme: `#2a2d2e`. |
| `--adrex-item-active-bg` | color | `#e8f0fe` | Background of the item selected with the keyboard. Dark theme: `#2a2d2e`. |
| `--adrex-highlight-color` | color | `inherit` | Color of the matched text (`.highlight`). |
| `--adrex-highlight-weight` | font weight | `bold` | Font weight of the matched text. |
| `--adrex-empty-color` | color | `#777777` | Color of the empty state. Dark theme: `#999999`. |

The element classes you can target are `.adrex-dropdown`, `.adrex-dropdown-item` (plus `.active` for the keyboard selection), `.adrex-dropdown-empty` and `.highlight`.

### Overriding the properties

The widget adds its `<style>` element at the end of `<head>`, after your own stylesheets. A rule in your `<head>` with the same specificity, such as a plain `.adrex-dropdown { ... }`, loses to it, so use a more specific selector:

```css
body .adrex-dropdown {
  --adrex-dropdown-radius: 8px;
  --adrex-highlight-color: #3182ce;
}
```

The dark theme's selectors are more specific again. To change a value that the dark theme also sets, use a selector that matches how you turn dark mode on:

```css
/* adrex.configure({ theme: 'dark' }) */
html[data-adrex-theme="dark"] .adrex-dropdown,
/* data-adrex-theme="dark" on <body> */
body[data-adrex-theme="dark"] .adrex-dropdown,
/* class adrex-theme-dark on <html> or <body> */
html.adrex-theme-dark .adrex-dropdown,
body.adrex-theme-dark .adrex-dropdown {
  --adrex-dropdown-bg: #10151c;
}
```

## Themes

### Dark mode

These work:

- Call `adrex.configure({ theme: 'dark' })`.
- Set `data-adrex-theme="dark"` on `<body>`.
- Add the class `adrex-theme-dark` to `<html>` or `<body>`.

Writing `<html data-adrex-theme="dark">` in your HTML does not work. The widget overwrites that attribute at load with its theme, which is `light` by default. Every later `adrex.configure()` call writes the attribute again, even one that doesn't mention `theme`.

Other ancestor elements don't work either. The dropdown is appended to `document.body`, so only `<html>` and `<body>` are ancestors of it.

### `theme: 'none'`

`theme: 'none'` does not stop the built-in styles being injected. The widget applies its default `light` theme when the script loads, so the styles are injected, or queued for `DOMContentLoaded`, before your code can call `configure()`. Setting `'none'` later doesn't remove them.

What `'none'` does do is stop the widget updating `data-adrex-theme` on `<html>`, so the attribute keeps its last value.

To restyle the dropdown fully, override the built-in rules with more specific selectors, as shown in [Overriding the properties](#overriding-the-properties).

## Fixed index settings

`src/lib/meilisearch.ts` applies these settings on every pipeline run. No environment variable changes them.

| Name | Type | Default | Description |
|---|---|---|---|
| Index name | string | `addresses` | Meilisearch index that holds the addresses. |
| Primary key | string | `id` | The RÚIAN address point code. Re-imports update documents by this key. |
| Searchable attributes | list | `searchText`, `street`, `city`, `cityPart`, `zip`, `wholeNumber`, `formattedWhole` | Listed in priority order. |
| Filterable attributes | list | `cityCode`, `districtCode`, `regionCode`, `zip`, `street` | The API exposes the first three as autocomplete filters. |
| Sortable attributes | list | `city`, `street`, `zip` | The API doesn't currently sort by these. |
| Ranking rules | list | `words`, `typo`, `proximity`, `attribute`, `sort`, `exactness` | Applied in this order. |
| Separator tokens | list | `/`, `-`, `,` | Extra word separators for Czech addresses. |
| `maxTotalHits` | integer | `1000` | Caps `totalHits` in autocomplete responses. |
| `minWordSizeForTypos` | object | `oneTypo: 3`, `twoTypos: 6` | Word length at which typos are tolerated. |
