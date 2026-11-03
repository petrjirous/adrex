# Using adrex

This page covers the main adrex workflows. It assumes a running install, as described in [Installing adrex](installation.md), and uses the local address `http://localhost:3100` and the key `dev-test-key-1` from `.env.example`.

All sample output on this page is illustrative. The real values depend on the imported dataset. Placeholders such as `<RÚIAN street code>` and coordinates of `0` stand for values the repository has no sample for.

## Import and refresh data

### First import

Start Meilisearch, then run the pipeline:

```bash
npm run pipeline
```

The pipeline downloads the RÚIAN ZIP, extracts the CSV files, sets up the `addresses` index and sends the documents to Meilisearch in batches. It logs one JSON object per line. This sample is shortened:

```text
{"level":30,"name":"pipeline:download","msg":"Downloading RÚIAN dataset", ...}
{"level":30,"name":"pipeline:download","msg":"Download complete", ...}
{"level":30,"name":"pipeline","total":10000,"msg":"Indexed batch", ...}
{"level":30,"name":"pipeline","msg":"All batches submitted. Waiting for Meilisearch to process...", ...}
{"level":30,"name":"pipeline","total":3012907,"skipped":0,"msg":"Pipeline finished", ...}
```

In a container, run `node dist/pipeline.js` instead:

```bash
docker compose exec api node dist/pipeline.js
```

### Refresh the data

ČÚZK updates RÚIAN monthly. To refresh, run the same command again. By default it finds and downloads the latest release.

Re-running adds or updates documents by `id`. It doesn't delete anything, so addresses removed from RÚIAN stay in the index. To remove them, delete the `addresses` index through Meilisearch's own API and run the pipeline again. Searches return a 503 error until the import has recreated the index.

### Download and index separately

```bash
# Download and extract only
npm run pipeline:download

# Index the CSV files that are already in RUIAN_DATA_DIR/CSV
npm run pipeline:index
```

The first command stops after a log line containing `Download-only mode complete`. The second one ends with `Pipeline finished`, as above.

In a container, add the flag to the command, for example `node dist/pipeline.js --index-only`. See [Pipeline flags](configuration.md#pipeline-flags).

## Authenticate

Every endpoint except `GET /health` needs an API key from `API_KEYS`. Send it as a Bearer token:

```bash
curl -X POST http://localhost:3100/api/v1/address/autocomplete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-test-key-1" \
  -d '{"query": "Vodičkova"}'
```

Or send it as the `apiKey` query parameter on the POST routes:

```bash
curl -X POST "http://localhost:3100/api/v1/address/autocomplete?apiKey=dev-test-key-1" \
  -H "Content-Type: application/json" \
  -d '{"query": "Vodičkova"}'
```

If a request has both, the Bearer token is used.

### Rate limiting

Requests are limited per API key: by default, 100 per 60-second window (see [Environment variables](configuration.md#environment-variables)). Going over the limit returns a 429 response with a `Retry-After` header in seconds. `/health` is exempt.

Two things affect how the limit behaves:

- Counts are held in memory in each API process. Each replica counts separately, and a restart resets the count.
- All visitors using a widget share its one API key, so they also share its limit. Raise `RATE_LIMIT_MAX` to match your traffic.

## Call autocomplete

`POST /api/v1/address/autocomplete` returns suggestions for a partial address.

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Free-text search. Surrounding spaces are trimmed. |
| `limit` | number | No | Maximum suggestions. Defaults to 10 and is clamped to 1–50. |
| `filter` | array | No | Objects with string `type` and `code` fields. All filters must match. |

The filter types are:

- `MUNICIPALITY_CODE`
- `DISTRICT_CODE`
- `REGION_CODE`

Unknown types are ignored, and so are entries whose `code` isn't a string.

`DISTRICT_CODE` and `REGION_CODE` currently match nothing. The pipeline's municipality mapping is empty, so `districtCode` and `regionCode` are empty on every imported address. Use `MUNICIPALITY_CODE`.

```bash
curl -X POST http://localhost:3100/api/v1/address/autocomplete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-test-key-1" \
  -d '{
    "query": "Vodičkova 30 Praha",
    "limit": 10,
    "filter": [
      { "type": "MUNICIPALITY_CODE", "code": "554782" }
    ]
  }'
```

Each suggestion has the shape `{ isWholeAddress, values, addressDetail }`:

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
        "code": "<RÚIAN address point code>",
        "street": "Vodičkova",
        "streetCode": "<RÚIAN street code>",
        "conscriptionNumber": "2141",
        "orientationNumber": "30",
        "orientationNumberChar": "",
        "provisionalNumber": "",
        "wholeNumber": "2141/30",
        "city": "Praha",
        "cityCode": "554782",
        "cityPart": "Nové Město",
        "cityPartCode": "<RÚIAN city part code>",
        "zip": "11000",
        "post": "Praha",
        "district": "",
        "districtCode": "",
        "region": "",
        "regionCode": "",
        "cityArea1": "<MOMC name>",
        "cityArea1Code": "<MOMC code>",
        "cityArea2": "<Prague district name>",
        "cityArea2Code": "<Prague district code>",
        "formattedFirstLine": "Vodičkova 2141/30",
        "formattedSecondLine": "Nové Město, 11000 Praha",
        "formattedWhole": "Vodičkova 2141/30, Nové Město, 11000 Praha",
        "coordJtskX": 0,
        "coordJtskY": 0,
        "coordWgs84Latitude": 0,
        "coordWgs84Longitude": 0,
        "country": "Česká republika",
        "countryCode": "CZE"
      }
    }
  ],
  "query": "Vodičkova 30 Praha",
  "totalHits": 1000,
  "processingTimeMs": 5
}
```

- `values` is keyed by the widget's input classes.
- `totalHits` is Meilisearch's estimate. It's capped by the index's `maxTotalHits: 1000`.
- [`AddressDetail` fields](#addressdetail-fields) describes `addressDetail`.

## Call validate

`POST /api/v1/address/validate` checks an address against the index. Send structured fields, or the whole address as one string:

| Field | Type | Description |
|---|---|---|
| `street` | string | Street name. |
| `houseNumber` | string | House number. |
| `city` | string | City name. |
| `zip` | string | ZIP code (PSČ). |
| `wholeAddress` | string | Free-text address. If present, the structured fields are ignored. |

All fields are optional, but at least one must have a value.

### Validate structured fields

```bash
curl -X POST http://localhost:3100/api/v1/address/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-test-key-1" \
  -d '{
    "street": "Vodičkova",
    "houseNumber": "30",
    "city": "Praha",
    "zip": "11000"
  }'
```

```json
{
  "result": {
    "type": "HIT",
    "addresses": [
      {
        "code": "<RÚIAN address point code>",
        "street": "Vodičkova",
        "streetCode": "<RÚIAN street code>",
        "conscriptionNumber": "2141",
        "orientationNumber": "30",
        "orientationNumberChar": "",
        "provisionalNumber": "",
        "wholeNumber": "2141/30",
        "city": "Praha",
        "cityCode": "554782",
        "cityPart": "Nové Město",
        "cityPartCode": "<RÚIAN city part code>",
        "zip": "11000",
        "post": "Praha",
        "district": "",
        "districtCode": "",
        "region": "",
        "regionCode": "",
        "cityArea1": "<MOMC name>",
        "cityArea1Code": "<MOMC code>",
        "cityArea2": "<Prague district name>",
        "cityArea2Code": "<Prague district code>",
        "formattedFirstLine": "Vodičkova 2141/30",
        "formattedSecondLine": "Nové Město, 11000 Praha",
        "formattedWhole": "Vodičkova 2141/30, Nové Město, 11000 Praha",
        "coordJtskX": 0,
        "coordJtskY": 0,
        "coordWgs84Latitude": 0,
        "coordWgs84Longitude": 0,
        "country": "Česká republika",
        "countryCode": "CZE"
      }
    ]
  },
  "processingTimeMs": 12
}
```

Structured input works in two steps:

1. The fields are joined into one search, which returns up to 50 hits.
2. The hits are filtered to an exact `zip` and a case-insensitive `street` and `city`.

This has some consequences:

- `houseNumber` is part of the search but not the filter, so a wrong number can still return other addresses on the same street.
- The filter doesn't ignore diacritics. `Vodickova` doesn't match `Vodičkova`, and the result is `NOTHING`.
- `city` must equal the municipality name, for example `Praha`.

### Validate a whole address

```bash
curl -X POST http://localhost:3100/api/v1/address/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-test-key-1" \
  -d '{"wholeAddress": "Vodičkova 2141/30, Nové Město, 11000 Praha"}'
```

The response has the same shape as above. `wholeAddress` skips the filter step, so `result.type` reflects every search hit and is more likely to be `MANY` or `TOOMANY`.

### Result types

| `result.type` | Meaning |
|---|---|
| `HIT` | 1 match |
| `MANY` | 2–10 matches |
| `TOOMANY` | More than 10 matches |
| `NOTHING` | 0 matches |
| `INSUFFICIENT_DATA` | No input was given. The response is still HTTP 200. |

At most 20 addresses are returned, whatever the type.

With an empty request body of `{}`, the response is:

```json
{
  "result": {
    "type": "INSUFFICIENT_DATA",
    "addresses": []
  },
  "processingTimeMs": 0
}
```

## Check health

`GET /health` needs no API key and isn't rate limited.

```bash
curl http://localhost:3100/health
```

```json
{
  "status": "ok",
  "timestamp": "2025-02-23T12:00:00.000Z",
  "meili": "connected"
}
```

The endpoint returns HTTP 200 with `status: "ok"` even if Meilisearch is down. Check the `meili` field, which is `connected` or `error`. The API's Kubernetes probes use this endpoint too, so they don't notice a Meilisearch outage.

## Add the widget

### Load the script

The bundle is `widget/dist/adrex.js`. If you host a copy with your own site, tell it where the API is with `data-adrex-url`:

```html
<script data-adrex-url="https://your-api.example.com" src="path/to/adrex.js"></script>
<script>adrex.setClientId('your-api-key');</script>
```

With the production Compose stack, Caddy serves the bundle at `/widget/dist/adrex.js`. Loading it from there needs no `data-adrex-url`, because the widget falls back to the script's origin:

```html
<script src="https://adrex.yourdomain.com/widget/dist/adrex.js"></script>
<script>adrex.setClientId('your-api-key');</script>
```

Anyone can read an API key used in a page, so give the widget its own key.

### Split fields

Give each field a class. The widget listens on every input with an `adrex-` class, so the user can start typing in any of them. Selecting a suggestion fills all the fields in the instance.

```html
<input class="adrex-street adrex-instance-shipping" placeholder="Street">
<input class="adrex-number adrex-instance-shipping" placeholder="Number">
<input class="adrex-city adrex-instance-shipping" placeholder="City">
<input class="adrex-zip adrex-instance-shipping" placeholder="ZIP">
```

After the user selects the sample address, the fields hold:

```text
Street  Vodičkova
Number  2141/30
City    Praha
ZIP     11000
```

Each filled input fires a bubbling `change` event. A field is only written when the suggestion has a value for it. For an address with no street, `adrex-street` keeps whatever the user typed.

For every class, see [Input classes](configuration.md#input-classes).

### Single field with auto-fill

The user searches in one field, and read-only fields show the result:

```html
<input class="adrex-whole-address adrex-instance-billing" placeholder="Search address...">
<input class="adrex-street-and-number adrex-instance-billing" readonly>
<input class="adrex-city adrex-instance-billing" readonly>
<input class="adrex-zip adrex-instance-billing" readonly>
```

After selection, the fields hold:

```text
Search address  Vodičkova 2141/30, Nové Město, 11000 Praha
Street, number  Vodičkova 2141/30
City            Praha
ZIP             11000
```

### Two instances on one page

Use a different `adrex-instance-{name}` class for each group. The class must be on each `<input>`. A class on a wrapping `<form>` or `<div>` is ignored, and the inputs would all join the `default` instance.

```html
<h3>Shipping address</h3>
<input class="adrex-whole-address adrex-instance-shipping" placeholder="Search address...">
<input class="adrex-zip adrex-instance-shipping" readonly>

<h3>Billing address</h3>
<input class="adrex-whole-address adrex-instance-billing" placeholder="Search address...">
<input class="adrex-zip adrex-instance-billing" readonly>
```

A selection in the shipping search fills only the shipping fields:

```text
shipping  Vodičkova 2141/30, Nové Město, 11000 Praha | 11000
billing   (unchanged)
```

Each instance can have its own options:

```javascript
adrex.getInstance('shipping').configure({ maxSuggestions: 5 });
```

### Add inputs after page load

The widget scans the page once at load. After you add inputs dynamically, scan again with `adrex.rebindAllForms(callback?)`. Inputs that are already bound aren't bound twice. The optional callback runs after the scan:

```javascript
adrex.rebindAllForms(() => console.log('Rebound adrex inputs'));
```

```text
Rebound adrex inputs
```

## Callbacks and programmatic control

### Callbacks

```javascript
adrex.configure({
  onSelect: (suggestion, instance) => {
    console.log(instance.id, suggestion.values['adrex-whole-address']);
    console.log(suggestion.addressDetail.cityCode);
  },
  onSuggest: (suggestions, query, instance) => {
    console.log(`${suggestions.length} suggestions for "${query}"`);
  },
  onError: (error, instance) => {
    console.error(instance.id, error.message);
  },
});
```

Selecting the sample address in the `shipping` instance logs:

```text
1 suggestions for "Vodičkova 30 Praha"
shipping Vodičkova 2141/30, Nové Město, 11000 Praha
554782
```

If the API answers with an error, `onError` logs the generic message below whatever the status was. The API's own error text doesn't reach the callback, so check the browser's network tab for it.

```text
shipping Network response was not ok
```

### Custom rendering

Each function returns an HTML string. `renderEmpty` receives no arguments.

```javascript
adrex.configure({
  renderSuggestion: (suggestion, query) => `
    <strong>${suggestion.values['adrex-street-and-number']}</strong>
    <small>${suggestion.values['adrex-zip']} ${suggestion.values['adrex-city']}</small>
  `,
  renderEmpty: () => '<div>No results</div>',
});
```

For the sample address, the item shows:

```text
Vodičkova 2141/30  11000 Praha
```

### Programmatic control

```javascript
const instance = adrex.getInstance('shipping');

instance.search('Vodičkova');  // write to the input and search at once, with no debounce
instance.hasSuggestions();     // true if the last search returned suggestions
instance.open();               // show the dropdown with the current suggestions
instance.close();              // close the dropdown
instance.destroy();            // remove the instance's listeners and clear its state
```

After a successful search, `instance.hasSuggestions()` returns:

```text
true
```

`adrex.getInstance()` without a name returns the `default` instance. A name that doesn't exist yet creates an empty instance, which lets you configure it before the page has loaded. `search()` and `open()` do nothing until the instance has inputs.

After `destroy()`, `adrex.rebindAllForms()` binds the instance's inputs again.

### Keyboard

| Key | Action |
|---|---|
| Down and Up arrows | Move through the suggestions. |
| Enter | Select the highlighted suggestion. While the dropdown is open, Enter doesn't submit the form. |
| Escape | Close the dropdown. |

## API errors

Errors are JSON objects with an `error` field, for example:

```json
{
  "error": "Rate limit exceeded"
}
```

| Status | `error` | Cause |
|---|---|---|
| 400 | `Invalid JSON body` | The request body isn't valid JSON. |
| 400 | `query is required and must be non-empty` | Autocomplete got a missing, empty or non-string `query`. |
| 401 | `Invalid or missing API key` | The key is absent or isn't in `API_KEYS`. |
| 404 | `Not found` | The route or method doesn't exist. |
| 429 | `Rate limit exceeded` | The key went over its limit. The `Retry-After` header gives the wait in seconds. |
| 503 | `Search service unavailable: ...` | The Meilisearch search failed. The rest of the message comes from Meilisearch. |

The API key is checked before the route, so a request to an unknown route without a valid key gets a 401, not a 404.

[Troubleshooting](troubleshooting.md) has a fix for each error.

## `AddressDetail` fields

`addressDetail` in autocomplete suggestions and each entry of `result.addresses` in validate responses have the same fields.

| Field | Type | Description |
|---|---|---|
| `code` | string | RÚIAN address point code (kód ADM). |
| `street` | string | Street name. Empty for addresses without a street. |
| `streetCode` | string | RÚIAN street code. |
| `conscriptionNumber` | string | House number (číslo domovní). |
| `orientationNumber` | string | Orientation number (číslo orientační). |
| `orientationNumberChar` | string | Letter of the orientation number. |
| `provisionalNumber` | string | Currently always empty. |
| `wholeNumber` | string | Display number, for example `2141/30`. |
| `city` | string | Municipality name. |
| `cityCode` | string | Municipality code, used by the `MUNICIPALITY_CODE` filter. |
| `cityPart` | string | City part name. |
| `cityPartCode` | string | City part code. |
| `zip` | string | ZIP code (PSČ). |
| `post` | string | Currently always the same as `city`. |
| `district` | string | Currently always empty. |
| `districtCode` | string | Currently always empty. |
| `region` | string | Currently always empty. |
| `regionCode` | string | Currently always empty. |
| `cityArea1` | string | MOMC (city district) name, where one exists. |
| `cityArea1Code` | string | MOMC code. |
| `cityArea2` | string | Prague district name, in Prague only. |
| `cityArea2Code` | string | Prague district code. |
| `formattedFirstLine` | string | First address line, for example `Vodičkova 2141/30`. |
| `formattedSecondLine` | string | Second address line, for example `Nové Město, 11000 Praha`. |
| `formattedWhole` | string | The whole address on one line. |
| `coordJtskX` | number | S-JTSK X coordinate. `0` if the source value is invalid. |
| `coordJtskY` | number | S-JTSK Y coordinate. `0` if the source value is invalid. |
| `coordWgs84Latitude` | number | WGS84 latitude. `0` if the conversion failed. |
| `coordWgs84Longitude` | number | WGS84 longitude. `0` if the conversion failed. |
| `country` | string | Always `Česká republika`. |
| `countryCode` | string | Always `CZE`. |
