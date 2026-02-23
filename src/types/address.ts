/**
 * Core address types matching RÚIAN data model and Adrex field conventions.
 */

/** Raw CSV row from RÚIAN address export */
export interface RuianCsvRow {
  /** Kód ADM - unique address point ID */
  kodAdm: string;
  /** Kód obce */
  kodObce: string;
  /** Název obce */
  nazevObce: string;
  /** Kód MOMC (městský obvod/městská část) - statutory cities only */
  kodMomc: string;
  /** Název MOMC */
  nazevMomc: string;
  /** Kód obvodu Prahy - Prague only */
  kodObvoduPrahy: string;
  /** Název obvodu Prahy */
  nazevObvoduPrahy: string;
  /** Kód části obce */
  kodCastiObce: string;
  /** Název části obce */
  nazevCastiObce: string;
  /** Kód ulice */
  kodUlice: string;
  /** Název ulice */
  nazevUlice: string;
  /** Typ SO: "č.p." or "č.ev." */
  typSo: string;
  /** Číslo domovní (popisné or evidenční) */
  cisloDomovni: string;
  /** Číslo orientační */
  cisloOrientacni: string;
  /** Znak čísla orientačního */
  znakCislaOrientacniho: string;
  /** PSČ */
  psc: string;
  /** Souřadnice Y (S-JTSK) */
  souradniceY: string;
  /** Souřadnice X (S-JTSK) */
  souradniceX: string;
  /** Datum platnosti */
  datumPlatnosti: string;
}

/** District (Okres) codelist entry */
export interface DistrictEntry {
  code: string;
  name: string;
  regionCode: string;
}

/** Region (Kraj) codelist entry */
export interface RegionEntry {
  code: string;
  name: string;
}

/** Municipality-to-district mapping */
export interface MunicipalityMapping {
  municipalityCode: string;
  districtCode: string;
  districtName: string;
  regionCode: string;
  regionName: string;
}

/** Fully denormalized address record for Meilisearch indexing */
export interface AddressDocument {
  /** Meilisearch document ID = RÚIAN kód ADM */
  id: string;

  // Core address fields
  street: string;
  streetCode: string;
  conscriptionNumber: string;
  orientationNumber: string;
  orientationNumberChar: string;
  provisionalNumber: string;
  wholeNumber: string;
  houseNumberType: "cp" | "cev";

  // Location hierarchy
  city: string;
  cityCode: string;
  cityPart: string;
  cityPartCode: string;
  district: string;
  districtCode: string;
  region: string;
  regionCode: string;
  cityArea: string;
  cityAreaCode: string;
  pragueDistrict: string;
  pragueDistrictCode: string;

  // Postal
  zip: string;

  // Coordinates (WGS84)
  lat: number;
  lng: number;
  /** Original JTSK X */
  jtskX: number;
  /** Original JTSK Y */
  jtskY: number;

  // Formatted
  formattedFirstLine: string;
  formattedSecondLine: string;
  formattedWhole: string;

  // Search-optimized composite field
  searchText: string;
}

/** Autocomplete API request */
export interface AutocompleteRequest {
  /** Free-text query */
  query: string;
  /** Max results (default 10) */
  limit?: number;
  /** Filter by region/district/municipality code */
  filter?: {
    type: "MUNICIPALITY_CODE" | "DISTRICT_CODE" | "REGION_CODE";
    code: string;
  }[];
  /** Country code (CZ only for MVP) */
  country?: "CZ";
}

/** Autocomplete API response */
export interface AutocompleteResponse {
  suggestions: AddressSuggestion[];
  query: string;
  totalHits: number;
  processingTimeMs: number;
}

/** Single autocomplete suggestion */
export interface AddressSuggestion {
  /** Whether this is a complete address (vs partial like city/street) */
  isWholeAddress: boolean;
  /** Values keyed by Adrex CSS field class */
  values: Record<string, string>;
  /** Full address detail (when isWholeAddress=true) */
  addressDetail?: AddressDetail;
}

/** Full address detail returned on validation or complete address selection */
export interface AddressDetail {
  code: string;
  street: string;
  streetCode: string;
  conscriptionNumber: string;
  orientationNumber: string;
  orientationNumberChar: string;
  provisionalNumber: string;
  wholeNumber: string;
  city: string;
  cityCode: string;
  cityPart: string;
  cityPartCode: string;
  zip: string;
  post: string;
  district: string;
  districtCode: string;
  region: string;
  regionCode: string;
  cityArea1: string;
  cityArea1Code: string;
  cityArea2: string;
  cityArea2Code: string;
  formattedFirstLine: string;
  formattedSecondLine: string;
  formattedWhole: string;
  coordJtskX: number;
  coordJtskY: number;
  coordWgs84Latitude: number;
  coordWgs84Longitude: number;
  country: string;
  countryCode: string;
}

/** Address validation request */
export interface ValidateRequest {
  /** Structured address fields */
  street?: string;
  houseNumber?: string;
  city?: string;
  zip?: string;
  /** Or free-text whole address */
  wholeAddress?: string;
  /** Country code */
  country?: "CZ";
}

/** Address validation response */
export interface ValidateResponse {
  result: {
    type: ValidationResultType;
    addresses: AddressDetail[];
  };
  processingTimeMs: number;
}

export type ValidationResultType =
  | "HIT"
  | "MANY"
  | "TOOMANY"
  | "NOTHING"
  | "INSUFFICIENT_DATA"
  | "LOCALITY_HIT";
