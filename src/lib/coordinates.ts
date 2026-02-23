import proj4 from "proj4";

/**
 * S-JTSK (Krovak) projection definition.
 * RÚIAN provides coordinates as positive values in S-JTSK system.
 * EPSG:5514 uses negative coordinates by convention, so we negate input values.
 */
proj4.defs(
  "EPSG:5514",
  "+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813972222222 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480 +units=m +no_defs"
);

export interface WGS84Coords {
  lat: number;
  lng: number;
}

/**
 * Convert S-JTSK coordinates (as provided by RÚIAN CSV, positive values) to WGS84.
 *
 * RÚIAN CSV provides:
 * - Souřadnice Y: ~400,000 - 900,000 (easting-like, positive)
 * - Souřadnice X: ~900,000 - 1,300,000 (northing-like, positive)
 *
 * S-JTSK (EPSG:5514) expects negative values, so we negate both.
 *
 * @param jtskY - Y coordinate from RÚIAN CSV (positive)
 * @param jtskX - X coordinate from RÚIAN CSV (positive)
 * @returns WGS84 latitude and longitude, or null if input is invalid
 */
export function jtskToWgs84(jtskY: number, jtskX: number): WGS84Coords | null {
  if (!jtskY || !jtskX || isNaN(jtskY) || isNaN(jtskX)) {
    return null;
  }

  // Negate to match EPSG:5514 convention
  const [lng, lat] = proj4("EPSG:5514", "EPSG:4326", [-jtskY, -jtskX]);

  if (!isFinite(lat) || !isFinite(lng)) {
    return null;
  }

  return {
    lat: Math.round(lat * 1_000_000) / 1_000_000,
    lng: Math.round(lng * 1_000_000) / 1_000_000,
  };
}
