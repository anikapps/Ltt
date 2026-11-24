export const MIN_PASSENGERS_PER_TRIP = 1;
export const MAX_PASSENGERS_PER_TRIP = 200;

export function clampPassengerCapacity(value: unknown, fallback = MAX_PASSENGERS_PER_TRIP): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(MIN_PASSENGERS_PER_TRIP, Math.min(MAX_PASSENGERS_PER_TRIP, Math.trunc(parsed)));
}
