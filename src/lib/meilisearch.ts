import { MeiliSearch } from "meilisearch";
import { config } from "./config.js";
import type { AddressDocument } from "../types/address.js";

let client: MeiliSearch | null = null;

export function getMeiliClient(): MeiliSearch {
  if (!client) {
    client = new MeiliSearch({
      host: config.meili.url,
      apiKey: config.meili.masterKey,
    });
  }
  return client;
}

export function getAddressIndex() {
  return getMeiliClient().index<AddressDocument>(config.meili.indexName);
}

/**
 * Configure the Meilisearch index with optimal settings for Czech address autocomplete.
 */
export async function configureIndex(): Promise<void> {
  const client = getMeiliClient();
  const indexName = config.meili.indexName;

  // Create index if not exists
  try {
    await client.createIndex(indexName, { primaryKey: "id" });
  } catch {
    // Index may already exist
  }

  const index = client.index(indexName);

  // Configure searchable attributes (order = priority)
  await index.updateSearchableAttributes([
    "searchText",
    "street",
    "city",
    "cityPart",
    "zip",
    "wholeNumber",
    "formattedWhole",
  ]);

  // Configure filterable attributes
  await index.updateFilterableAttributes([
    "cityCode",
    "districtCode",
    "regionCode",
    "zip",
    "street",
  ]);

  // Configure sortable attributes
  await index.updateSortableAttributes(["city", "street", "zip"]);

  // Configure displayed attributes (all)
  await index.updateDisplayedAttributes(["*"]);

  // Ranking rules optimized for address autocomplete
  await index.updateRankingRules([
    "words",
    "typo",
    "proximity",
    "attribute",
    "sort",
    "exactness",
  ]);

  // Separator tokens - handle Czech address specifics
  await index.updateSeparatorTokens(["/", "-", ","]);

  // Pagination: allow deep pagination for validation queries
  await index.updatePagination({ maxTotalHits: 1000 });

  // Typo tolerance settings
  await index.updateTypoTolerance({
    enabled: true,
    minWordSizeForTypos: {
      oneTypo: 3,
      twoTypos: 6,
    },
  });
}
