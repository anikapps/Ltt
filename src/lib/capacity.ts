/**
 * One authoritative per-trip passenger ceiling.
 * Keep database enforcement in sync with this application constant.
 */
export const MAX_PASSENGERS_PER_TRIP = 500;

export function clampPassengerCapacity(value: unknown, fallback = MAX_PASSENGERS_PER_TRIP): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Passenger capacity must be a whole number between 1 and ${MAX_PASSENGERS_PER_TRIP}.`);
  }
  return Math.min(parsed, MAX_PASSENGERS_PER_TRIP);
}
