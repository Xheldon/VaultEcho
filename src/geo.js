// GCJ-02 ("Mars") <-> WGS-84 coordinate conversion.
//
// GCJ-02 is a deterministic, China-only obfuscation of WGS-84. There is no way
// to tell from the numbers alone which datum a coordinate already uses, so the
// conversion direction must always be supplied explicitly by the caller.

const PI = Math.PI;
const KRASOVSKY_A = 6378245.0; // semi-major axis of the Krasovsky 1940 ellipsoid
const KRASOVSKY_EE = 0.00669342162296594323; // first eccentricity squared

export function normalizeDatum(value) {
  const normalized = String(value || "").toLowerCase().replace(/[-_\s]/g, "");
  if (["wgs84", "wgs", "gps"].includes(normalized)) return "wgs84";
  if (["gcj02", "gcj", "mars", "amap", "gaode"].includes(normalized)) return "gcj02";
  throw new Error(`Unknown coordinate system: ${value}`);
}

export function convertCoordinate(lat, lng, from, to) {
  const source = normalizeDatum(from);
  const target = normalizeDatum(to);
  if (source === target) return [lat, lng];
  if (source === "wgs84" && target === "gcj02") return wgs84ToGcj02(lat, lng);
  if (source === "gcj02" && target === "wgs84") return gcj02ToWgs84(lat, lng);
  throw new Error(`Unsupported coordinate conversion: ${source} -> ${target}`);
}

export function wgs84ToGcj02(lat, lng) {
  if (outOfChina(lat, lng)) return [lat, lng];
  const [dLat, dLng] = delta(lat, lng);
  return [lat + dLat, lng + dLng];
}

export function gcj02ToWgs84(lat, lng) {
  if (outOfChina(lat, lng)) return [lat, lng];
  // GCJ-02 -> WGS-84 has no closed form; iterate the exact forward transform.
  let wgsLat = lat;
  let wgsLng = lng;
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const [gcjLat, gcjLng] = wgs84ToGcj02(wgsLat, wgsLng);
    const errorLat = lat - gcjLat;
    const errorLng = lng - gcjLng;
    wgsLat += errorLat;
    wgsLng += errorLng;
    if (Math.abs(errorLat) < 1e-11 && Math.abs(errorLng) < 1e-11) break;
  }
  return [wgsLat, wgsLng];
}

// Outside mainland China the GCJ-02 offset is not applied, so conversion is a no-op.
function outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function delta(lat, lng) {
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - KRASOVSKY_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((KRASOVSKY_A * (1 - KRASOVSKY_EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((KRASOVSKY_A / sqrtMagic) * Math.cos(radLat) * PI);
  return [dLat, dLng];
}

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

// Parses "lat,lng" or [lat, lng], remembering the shape so callers can write it back.
export function parseLatLng(value) {
  if (Array.isArray(value)) {
    if (value.length < 2) throw new Error("coordinate array must be [lat, lng]");
    return { lat: toFiniteNumber(value[0]), lng: toFiniteNumber(value[1]), shape: "array" };
  }
  const parts = String(value).trim().split(",").map((part) => part.trim());
  if (parts.length < 2) throw new Error('coordinate must be "lat,lng" or [lat, lng]');
  return { lat: toFiniteNumber(parts[0]), lng: toFiniteNumber(parts[1]), shape: "string" };
}

export function roundCoordinate(value) {
  return Math.round(value * 1e7) / 1e7;
}

function toFiniteNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid coordinate number: ${value}`);
  return number;
}
