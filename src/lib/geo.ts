/**
 * Computes distance in meters between two GPS coordinates using the Haversine formula.
 */
export function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function formatDistance(meters: number | null): string {
  if (meters === null || isNaN(meters)) return 'Distance unknown';
  if (meters < 1000) return `${meters} m away`;
  return `${(meters / 1000).toFixed(2)} km away`;
}

/**
 * Generates an official Google Maps Directions URL from origin to destination.
 */
export function buildGoogleMapsDirectionsUrl(params: {
  originLat?: number | null;
  originLng?: number | null;
  destLat: number;
  destLng: number;
  travelMode?: 'walking' | 'driving' | 'transit';
}): string {
  const mode = params.travelMode || 'walking';
  if (
    typeof params.originLat === 'number' &&
    typeof params.originLng === 'number'
  ) {
    return `https://www.google.com/maps/dir/?api=1&origin=${params.originLat},${params.originLng}&destination=${params.destLat},${params.destLng}&travelmode=${mode}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${params.destLat},${params.destLng}&travelmode=${mode}`;
}
