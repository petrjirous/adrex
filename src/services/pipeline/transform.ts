import type {
  AddressDocument,
  MunicipalityMapping,
  RuianCsvRow,
} from "../../types/address.js";
import { jtskToWgs84 } from "../../lib/coordinates.js";

const emptyMapping: MunicipalityMapping = {
  municipalityCode: "",
  districtCode: "",
  districtName: "",
  regionCode: "",
  regionName: "",
};

function normalize(value: string | undefined): string {
  return value?.trim() || "";
}

function buildWholeNumber(
  conscription: string,
  orientation: string,
  orientationChar: string
): string {
  if (!orientation) {
    return conscription;
  }
  return `${conscription}/${orientation}${orientationChar}`;
}

function buildHouseNumberType(typSo: string): "cp" | "cev" {
  if (typSo === "č.ev.") {
    return "cev";
  }
  return "cp";
}

function buildFormattedSecondLine(
  cityPart: string,
  zip: string,
  city: string
): string {
  if (cityPart && cityPart !== city) {
    return `${cityPart}, ${zip} ${city}`.trim();
  }
  return `${zip} ${city}`.trim();
}

function buildSearchText(values: string[]): string {
  return values.filter(Boolean).join(" ").trim();
}

export function transformToDocument(
  row: RuianCsvRow,
  municipalityMap?: Map<string, MunicipalityMapping>
): AddressDocument {
  const city = normalize(row.nazevObce);
  const cityPart = normalize(row.nazevCastiObce);
  const street = normalize(row.nazevUlice);
  const conscriptionNumber = normalize(row.cisloDomovni);
  const orientationNumber = normalize(row.cisloOrientacni);
  const orientationChar = normalize(row.znakCislaOrientacniho);
  const zip = normalize(row.psc);

  const wholeNumber = buildWholeNumber(
    conscriptionNumber,
    orientationNumber,
    orientationChar
  );
  const houseNumberType = buildHouseNumberType(normalize(row.typSo));

  const firstLineBase = street || cityPart;
  const formattedFirstLine = [firstLineBase, wholeNumber]
    .filter(Boolean)
    .join(" ")
    .trim();
  const formattedSecondLine = buildFormattedSecondLine(cityPart, zip, city);
  const formattedWhole = [formattedFirstLine, formattedSecondLine]
    .filter(Boolean)
    .join(", ")
    .trim();

  const jtskY = Number(row.souradniceY);
  const jtskX = Number(row.souradniceX);
  const coords = jtskToWgs84(jtskY, jtskX);
  const lat = coords?.lat ?? 0;
  const lng = coords?.lng ?? 0;

  const mapping = municipalityMap?.get(row.kodObce) ?? emptyMapping;

  return {
    id: normalize(row.kodAdm),
    street,
    streetCode: normalize(row.kodUlice),
    conscriptionNumber,
    orientationNumber,
    orientationNumberChar: orientationChar,
    provisionalNumber: "",
    wholeNumber,
    houseNumberType,
    city,
    cityCode: normalize(row.kodObce),
    cityPart,
    cityPartCode: normalize(row.kodCastiObce),
    district: normalize(mapping.districtName),
    districtCode: normalize(mapping.districtCode),
    region: normalize(mapping.regionName),
    regionCode: normalize(mapping.regionCode),
    cityArea: normalize(row.nazevMomc),
    cityAreaCode: normalize(row.kodMomc),
    pragueDistrict: normalize(row.nazevObvoduPrahy),
    pragueDistrictCode: normalize(row.kodObvoduPrahy),
    zip,
    lat,
    lng,
    jtskX: Number.isFinite(jtskX) ? jtskX : 0,
    jtskY: Number.isFinite(jtskY) ? jtskY : 0,
    formattedFirstLine,
    formattedSecondLine,
    formattedWhole,
    searchText: buildSearchText([
      street,
      wholeNumber,
      city,
      cityPart,
      zip,
    ]),
  };
}

export async function buildMunicipalityMap(): Promise<
  Map<string, MunicipalityMapping>
> {
  return new Map();
}
