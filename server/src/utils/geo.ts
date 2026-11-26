import { CONFIG } from '../config.js';
import { TEHRAN_PLACES, TehranPlace } from '../data/tehranData.js';

export function isInsideTehran(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const { minLat, maxLat, minLng, maxLng } = CONFIG.TEHRAN_BOUNDS;
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Coarsens coordinates to ~300m grid for privacy before ownership verification
 */
export function coarsenCoordinate(value: number): number {
  return Math.round(value * 333) / 333;
}

export function findNearestTehranPlace(lat: number, lng: number): TehranPlace {
  let best = TEHRAN_PLACES[0];
  let bestDist = Infinity;
  for (const place of TEHRAN_PLACES) {
    const d = haversineDistanceMeters(lat, lng, place.lat, place.lng);
    if (d < bestDist) {
      bestDist = d;
      best = place;
    }
  }
  return best;
}
