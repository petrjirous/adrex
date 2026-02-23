import type { Context } from "hono";
import { getAddressIndex } from "../../lib/meilisearch.js";
import type {
  AddressDetail,
  AddressDocument,
  AddressSuggestion,
  AutocompleteResponse,
} from "../../types/address.js";

const FILTER_TYPE_MAP: Record<string, string> = {
  MUNICIPALITY_CODE: "cityCode",
  DISTRICT_CODE: "districtCode",
  REGION_CODE: "regionCode",
};

function hitToAddressDetail(hit: AddressDocument): AddressDetail {
  return {
    code: hit.id,
    street: hit.street,
    streetCode: hit.streetCode,
    conscriptionNumber: hit.conscriptionNumber,
    orientationNumber: hit.orientationNumber,
    orientationNumberChar: hit.orientationNumberChar,
    provisionalNumber: hit.provisionalNumber,
    wholeNumber: hit.wholeNumber,
    city: hit.city,
    cityCode: hit.cityCode,
    cityPart: hit.cityPart,
    cityPartCode: hit.cityPartCode,
    zip: hit.zip,
    post: hit.city,
    district: hit.district,
    districtCode: hit.districtCode,
    region: hit.region,
    regionCode: hit.regionCode,
    cityArea1: hit.cityArea,
    cityArea1Code: hit.cityAreaCode,
    cityArea2: hit.pragueDistrict,
    cityArea2Code: hit.pragueDistrictCode,
    formattedFirstLine: hit.formattedFirstLine,
    formattedSecondLine: hit.formattedSecondLine,
    formattedWhole: hit.formattedWhole,
    coordJtskX: hit.jtskX,
    coordJtskY: hit.jtskY,
    coordWgs84Latitude: hit.lat,
    coordWgs84Longitude: hit.lng,
    country: "Česká republika",
    countryCode: "CZE",
  };
}

function hitToSuggestion(hit: AddressDocument): AddressSuggestion {
  const cityExtended =
    hit.cityPart && hit.cityPart !== hit.city
      ? `${hit.city} - ${hit.cityPart}`
      : hit.city;

  return {
    isWholeAddress: true,
    values: {
      "adrex-street": hit.street,
      "adrex-number": hit.wholeNumber,
      "adrex-street-and-number": `${hit.street} ${hit.wholeNumber}`.trim(),
      "adrex-city": hit.city,
      "adrex-city-extended": cityExtended,
      "adrex-zip": hit.zip,
      "adrex-whole-address": hit.formattedWhole,
    },
    addressDetail: hitToAddressDetail(hit),
  };
}

export async function autocompleteHandler(c: Context): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return c.json({ error: "query is required and must be non-empty" }, 400);
  }

  const rawLimit = typeof body.limit === "number" ? body.limit : 10;
  const limit = Math.max(1, Math.min(50, rawLimit));

  const filterStrings: string[] = [];
  if (Array.isArray(body.filter)) {
    for (const f of body.filter) {
      if (
        f &&
        typeof f === "object" &&
        "type" in f &&
        "code" in f &&
        typeof f.type === "string" &&
        typeof f.code === "string"
      ) {
        const field = FILTER_TYPE_MAP[f.type];
        if (field) {
          filterStrings.push(`${field} = '${f.code}'`);
        }
      }
    }
  }

  const startTime = performance.now();
  const index = getAddressIndex();
  let results;
  try {
    results = await index.search(query, {
      limit,
      filter: filterStrings.length > 0 ? filterStrings : undefined,
      attributesToHighlight: ["searchText"],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return c.json({ error: `Search service unavailable: ${message}` }, 503);
  }
  const processingTimeMs = Math.round(performance.now() - startTime);
  const suggestions: AddressSuggestion[] = results.hits.map(hitToSuggestion);
  const response: AutocompleteResponse = {
    suggestions,
    query,
    totalHits: results.estimatedTotalHits ?? results.hits.length,
    processingTimeMs,
  };
  return c.json(response);
}
