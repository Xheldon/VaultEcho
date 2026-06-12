import assert from "node:assert/strict";
import test from "node:test";
import { convertCoordinate, gcj02ToWgs84, normalizeDatum, parseLatLng, wgs84ToGcj02 } from "../src/geo.js";

test("wgs84 -> gcj02 round-trips back within ~1cm inside China", () => {
  const wgsLat = 31.2304;
  const wgsLng = 121.4737;
  const [gcjLat, gcjLng] = wgs84ToGcj02(wgsLat, wgsLng);

  // The China offset is real and non-trivial (hundreds of meters).
  assert.ok(Math.abs(gcjLat - wgsLat) > 1e-4, "latitude should shift");
  assert.ok(Math.abs(gcjLng - wgsLng) > 1e-4, "longitude should shift");

  const [backLat, backLng] = gcj02ToWgs84(gcjLat, gcjLng);
  assert.ok(Math.abs(backLat - wgsLat) < 1e-7, "latitude round-trips");
  assert.ok(Math.abs(backLng - wgsLng) < 1e-7, "longitude round-trips");
});

test("coordinates outside mainland China are left unchanged", () => {
  const lat = 40.6892;
  const lng = -74.0445;
  assert.deepEqual(wgs84ToGcj02(lat, lng), [lat, lng]);
  assert.deepEqual(gcj02ToWgs84(lat, lng), [lat, lng]);
});

test("convertCoordinate is a no-op when datums match and dispatches both directions", () => {
  assert.deepEqual(convertCoordinate(31.2, 121.4, "wgs84", "wgs84"), [31.2, 121.4]);
  assert.deepEqual(convertCoordinate(31.2, 121.4, "gcj02", "wgs84"), gcj02ToWgs84(31.2, 121.4));
  assert.deepEqual(convertCoordinate(31.2, 121.4, "wgs84", "gcj02"), wgs84ToGcj02(31.2, 121.4));
});

test("normalizeDatum accepts aliases and rejects unknown systems", () => {
  assert.equal(normalizeDatum("WGS-84"), "wgs84");
  assert.equal(normalizeDatum("gps"), "wgs84");
  assert.equal(normalizeDatum("GCJ02"), "gcj02");
  assert.equal(normalizeDatum("gaode"), "gcj02");
  assert.throws(() => normalizeDatum("bd09"), /Unknown coordinate system/);
});

test("parseLatLng handles strings and arrays and remembers the shape", () => {
  assert.deepEqual(parseLatLng("31.2304, 121.4737"), { lat: 31.2304, lng: 121.4737, shape: "string" });
  assert.deepEqual(parseLatLng([31.2304, 121.4737]), { lat: 31.2304, lng: 121.4737, shape: "array" });
  assert.throws(() => parseLatLng("31.2304"), /coordinate must be/);
});
