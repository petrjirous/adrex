# Troubleshooting

Find your error message or symptom below. If you're still setting up, see [Installing adrex](installation.md).

## Setup

### `docker compose` fails with `Set MEILI_MASTER_KEY in .env`

`docker-compose.yml` needs values from `.env`, and `.env` isn't in the repository. You'd see `Set API_KEYS in .env` for the same reason.

Create the file, then run the command again:

```bash
cp .env.example .env
```

## API errors

For the full list of responses, see [API errors](usage.md#api-errors).

### 400 `Invalid JSON body`

The request body isn't valid JSON. Check for unbalanced quotes in your `curl -d` argument, and make sure the body isn't empty.

### 400 `query is required and must be non-empty`

The autocomplete request has no `query`, or it's empty, only spaces or not a string. Send a non-empty string:

```json
{
  "query": "Vodičkova 30 Praha"
}
```

### 401 `Invalid or missing API key`

The key is missing or isn't in `API_KEYS`:

- Send the key as `Authorization: Bearer <key>` or as `?apiKey=<key>`.
- Check that the server has `API_KEYS` set. If it's empty, every key is refused. Restart the API after changing `.env`.
- If you changed `API_KEYS`, the local demo page stops working unless you keep `dev-test-key-1`. In production, it needs `demo-public-key`.

This check runs before routing, so any route except `GET /health` returns this error when the key is wrong.

### 404 `Not found`

The route or method doesn't exist. The API only has three routes:

- `GET /health`
- `POST /api/v1/address/autocomplete`
- `POST /api/v1/address/validate`

The two address routes only accept `POST`, so a GET request with a valid key returns this error.

### 429 `Rate limit exceeded`

The API key went over `RATE_LIMIT_MAX` in the current window. Wait for the number of seconds in the `Retry-After` header, or raise `RATE_LIMIT_MAX`.

All visitors using a widget share one key, and so one limit. The count is kept in memory per process, so each API replica counts separately, and restarting the API clears the count. `/health` is exempt.

### 503 `Search service unavailable: ...`

The API reached the search step, but the search failed. The rest of the message comes from Meilisearch and tells you which of these it is:

- Meilisearch isn't running or can't be reached. See [Meilisearch is unreachable](#meilisearch-is-unreachable).
- The `addresses` index doesn't exist, because the pipeline hasn't run yet. Run `npm run pipeline`.
- `MEILI_MASTER_KEY` doesn't match the key Meilisearch started with.

### `/health` says `status: "ok"`, but searches fail

`/health` returns HTTP 200 with `status: "ok"` even when Meilisearch is down, so check the `meili` field:

- `"meili": "error"` means the API can't reach Meilisearch. See [Meilisearch is unreachable](#meilisearch-is-unreachable).
- `"meili": "connected"` only proves that Meilisearch answers. A wrong master key or a missing index still gives a 503 on searches.

### Searches return nothing, or district and region filters match nothing

If you filter by `DISTRICT_CODE` or `REGION_CODE`, this is expected. Those fields are empty on every imported address, so use `MUNICIPALITY_CODE`. Unknown filter types are ignored without an error.

If a search with no filter returns nothing, check that the pipeline finished. The last log line should contain `Pipeline finished`.

### Validate returns `INSUFFICIENT_DATA`

The request had none of `street`, `houseNumber`, `city`, `zip` or `wholeAddress`, or their values were empty or not strings. It's a normal HTTP 200 response. Note that the house number field is `houseNumber`.

### Validate returns `NOTHING` for an address that exists

Structured input must match exactly on `zip`, and on `street` and `city` apart from letter case. Check the diacritics and use the municipality name for `city`, such as `Praha`. Or send the address as `wholeAddress`, which skips this filter.

## Widget

### Console warning `Adrex: apiKey not set...`

The full message is `Adrex: apiKey not set. Call adrex.setClientId() or adrex.configure({ apiKey })`. The widget doesn't send a request until it has a key. Set one before the user starts typing:

```javascript
adrex.setClientId('your-api-key');
```

### Console warning `Adrex: apiUrl not set...`

The full message is `Adrex: apiUrl not set. Provide data-adrex-url or adrex.configure({ apiUrl })`. The widget always detects a URL at load, so this normally means something set it to an empty string, such as `adrex.configure({ apiUrl: '' })`. Check for an unset variable in your configuration code, then provide a real URL with `data-adrex-url` or `adrex.configure({ apiUrl })`.

### The widget calls the wrong URL

There's no warning for this. If you host `adrex.js` with your own site and don't set `data-adrex-url`, the widget uses your site's origin as the API URL. The requests fail and the console shows `Adrex error:`. Set the URL on the script tag:

```html
<script data-adrex-url="https://your-api.example.com" src="path/to/adrex.js"></script>
```

Also avoid a trailing slash in `adrex.configure({ apiUrl })`. Only `data-adrex-url` has it removed.

### `onError` only says `Network response was not ok`

The widget reports every non-2xx response with this same message. Open the failing request in the browser's network tab to see the status and the API's error text, then look it up under [API errors](#api-errors).

### Typing does nothing

Check these:

- The input has an `adrex-` class and existed when the page loaded. For inputs added later, call `adrex.rebindAllForms()`.
- The input has at least `minChars` characters, which is 2 by default.
- The console has no warning from the entries above.

### Filling one form also fills the other

Both forms are in the same instance. `adrex-instance-{name}` must be on each `<input>`. A class on a wrapping `<form>` or `<div>` is ignored, and those inputs all join the `default` instance. See [Two instances on one page](usage.md#two-instances-on-one-page).

### A field keeps its old value after selection

The widget skips a field when the suggestion has no value for it. For an address with no street, `adrex-street` keeps what the user typed. Use `adrex-street-and-number` or `adrex-whole-address`, or clear the field in `onSelect`.

### Dark mode doesn't apply

`<html data-adrex-theme="dark">` doesn't work, because the widget overwrites that attribute at load. Use one of the options in [Dark mode](configuration.md#dark-mode).

### `theme: 'none'` doesn't remove the styles

That's the current behaviour. The styles are injected before your code can call `configure()`. See [`theme: 'none'`](configuration.md#theme-none).

### My CSS custom properties have no effect

A plain `.adrex-dropdown` rule in your `<head>` loses to the widget's stylesheet, which is added after it. Use a more specific selector, as shown in [Overriding the properties](configuration.md#overriding-the-properties).

## CORS

### The browser reports a CORS error

The API already sends `Access-Control-Allow-Origin: *` on its responses and answers `OPTIONS` preflight requests with a 204, without needing a key. You don't need to configure anything.

If you still see a CORS error:

- **Proxy headers:** check whether your proxy or load balancer adds its own CORS headers. Those duplicate the API's header, and browsers reject a response with two values. Remove them from the proxy.
- **Proxy `OPTIONS` handling:** check that the proxy forwards `OPTIONS` requests to the API.
- **Reachability:** check that the API is up at the URL in the network tab. A request that fails at the proxy can show up as a CORS error, because the proxy's error page has no CORS headers.

## Data import

### The RÚIAN download fails

The pipeline logs `Pipeline failed` and exits with code 1. It doesn't retry. Look for one of these messages in the log:

| Message | Cause | Fix |
|---|---|---|
| `Failed to fetch RÚIAN download page: <status>` | The ČÚZK page is unavailable. | Wait and run the pipeline again. |
| A network error such as `fetch failed` | The server can't reach ČÚZK. | Check the connection, then run the pipeline again. |
| `Could not find CSV download link on RÚIAN page` | The page changed, so `auto` can't find the link. | Find the ZIP's URL yourself and set `RUIAN_CSV_URL` to it. |
| `Failed to download RÚIAN CSV: <status> <statusText>` | The download itself failed. | Wait and try again, or check your `RUIAN_CSV_URL`. |
| `No CSV files found in CSV/ subdirectory after extraction` | The ZIP has no CSV files. | Check that the URL points to the address point CSV package. |
| `CSV/ subdirectory not found after extraction in <dir>` | The ZIP has a different layout. | Check that the URL points to the address point CSV package. |

`auto` reads the link from `https://nahlizenidokn.cuzk.cz/StahniAdresniMistaRUIAN.aspx`. If the extraction step itself fails, check that `unzip` is installed and that there's free disk space.

In the `docker-compose.yml` stack, `RUIAN_CSV_URL` from `.env` doesn't reach the container. Run the pipeline from your machine, or pass the variable with `docker compose exec -e`. See [Where each variable applies](configuration.md#where-each-variable-applies).

### `CSV directory not found. Run without --index-only first.`

`--index-only` found no `.csv` files in `RUIAN_DATA_DIR/CSV`. Run the full pipeline, or download first:

```bash
npm run pipeline:download
npm run pipeline:index
```

In the production stack, the API container has no data volume, so the CSV files are gone after it's recreated. Run `node dist/pipeline.js` without the flag there.

### The pipeline fails while waiting for Meilisearch

The pipeline waits up to 10 minutes for Meilisearch to process the last batch, then fails with a timeout. The submitted batches keep processing in Meilisearch, so wait a while before you check the results or run the pipeline again.

### Old addresses are still in the index

This is expected. Re-running the pipeline adds or updates documents by `id` and doesn't delete anything, so addresses removed from RÚIAN stay in the index. See [Refresh the data](usage.md#refresh-the-data).

### I want more detailed logs

The API and the pipeline have no setting for log detail. For the API, use the container's logs:

```bash
docker compose logs -f api
```

## Meilisearch

### Meilisearch is unreachable

Symptoms are `"meili": "error"` from `/health`, a 503 from search routes or a pipeline failure when it sets up the index.

Check that the container is running and healthy:

```bash
docker compose ps
curl http://localhost:7700/health
```

If it's running, check these settings:

- `MEILI_URL`: `http://localhost:7700` for local `npm` commands. The Compose files set the in-network address for the `api` container.
- `MEILI_MASTER_KEY`: must match the key Meilisearch started with.

In the production stack, Meilisearch's port isn't published, so the `curl` command above won't work from the host. Use the logs instead:

```bash
docker compose -f docker-compose.prod.yml logs -f meilisearch
```

## Kubernetes

### Pods are refused with `runAsNonRoot`

This is a likely issue that hasn't been confirmed on a cluster.

`k8s/api-deployment.yaml` and `k8s/pipeline-job.yaml` set `runAsNonRoot: true`, but the `Dockerfile` has no `USER` and the manifests have no `runAsUser`. The image therefore runs as root, and Kubernetes is likely to refuse to start these containers. Expect a `CreateContainerConfigError` status and a message saying the image will run as root:

```bash
kubectl -n adrex get pods
kubectl -n adrex describe pod <pod-name>
```

To work around it, set a non-root user in your copy of those two manifests. The `node:22-slim` base image has a `node` user with UID 1000:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
```

`k8s/meilisearch-deployment.yaml` also sets `runAsNonRoot: true` with no `runAsUser`. Whether that causes the same problem depends on the Meilisearch image.

> **TBD:** Whether `getmeili/meilisearch:v1.12` runs as a non-root user, and which UID suits its data volume. The repo doesn't show this.

### The Kubernetes Ingress doesn't serve the widget

That's how it's set up: `k8s/ingress.yaml` sends all traffic to the API. Host `widget/dist/adrex.js` with your own site and set `data-adrex-url`.
