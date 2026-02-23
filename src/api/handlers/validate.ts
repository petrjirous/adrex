import type { Context } from "hono";
import { getAddressIndex } from "../../lib/meilisearch.js";
import type {
  AddressDetail,
  AddressDocument,
  ValidateResponse,
  ValidationResultType,
} from "../../types/address.js";

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

function matchesFilter(hit: AddressDocument, filters: { zip?: string; street?: string; city?: string }): boolean {
  if (filters.zip && hit.zip !== filters.zip) return false;
  if (filters.city && hit.city.toLowerCase() !== filters.city.toLowerCase()) return false;
  if (filters.street && hit.street.toLowerCase() !== filters.street.toLowerCase()) return false;
  return true;
}

function determineResultType(count: number): ValidationResultType {
  if (count === 0) return "NOTHING";
  if (count === 1) return "HIT";
  if (count <= 10) return "MANY";
  return "TOOMANY";
}

export async function validateHandler(c: Context): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const street = typeof body.street === "string" ? body.street.trim() : "";
  const houseNumber = typeof body.houseNumber === "string" ? body.houseNumber.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const zip = typeof body.zip === "string" ? body.zip.trim() : "";
  const wholeAddress = typeof body.wholeAddress === "string" ? body.wholeAddress.trim() : "";

  let searchQuery: string;
  if (wholeAddress) {
    searchQuery = wholeAddress;
  } else {
    searchQuery = [street, houseNumber, city, zip].filter(Boolean).join(" ");
  }

  if (!searchQuery) {
    const response: ValidateResponse = {
      result: { type: "INSUFFICIENT_DATA", addresses: [] },
      processingTimeMs: 0,
    };
    return c.json(response);
  }

  const startTime = performance.now();
  const index = getAddressIndex();
  let results;
  try {
    results = await index.search(searchQuery, { limit: 50 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return c.json({ error: `Search service unavailable: ${message}` }, 503);
  }

  const processingTimeMs = Math.round(performance.now() - startTime);
  let filteredHits = results.hits;
  if (!wholeAddress && (zip || street || city)) {
    filteredHits = results.hits.filter((hit) =>
      matchesFilter(hit, { zip: zip || undefined, street: street || undefined, city: city || undefined })
    );
  }
  const addresses = filteredHits.slice(0, 20).map(hitToAddressDetail);
  const resultType = determineResultType(filteredHits.length);
  const response: ValidateResponse = {
    result: { type: resultType, addresses },
    processingTimeMs,
  };
  return c.json(response);
}
