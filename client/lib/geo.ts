export type LatLng = { lat: number; lng: number };

export type StopLike = {
  stopName?: string;
  name?: string;
  sequenceOrder?: number;
  location?: { coordinates?: [number, number] | number[] } | null;
  coordinates?: [number, number] | number[];
};

export type ManifestCustomerRef = { _id?: string } | string | null | undefined;

export type ManifestEntry = {
  customer?: ManifestCustomerRef;
  pickupStop?: StopLike | null;
  dropStop?: StopLike | null;
  status: 'PENDING' | 'BOARDED' | 'DROPPED' | 'NO_SHOW';
};

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export const hasGoogleMapsKey = GOOGLE_MAPS_KEY.length > 0;

export const stopDisplayName = (stop: StopLike | null | undefined, idx = 0): string => {
  if (!stop) return `Stop ${idx + 1}`;
  return stop.stopName || stop.name || `Stop ${idx + 1}`;
};

export const toLatLng = (stop: StopLike | null | undefined): LatLng | null => {
  if (!stop) return null;
  const coords = stop.location?.coordinates || stop.coordinates;
  if (!coords || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng };
};

export const normalizeStops = (stops: StopLike[] | undefined | null) => {
  if (!Array.isArray(stops)) return [];
  return stops
    .map((s, i) => ({ stop: s, order: s.sequenceOrder ?? i + 1, latlng: toLatLng(s) }))
    .filter((s) => s.latlng)
    .sort((a, b) => a.order - b.order);
};

export type TripPhase = 'PICKUP' | 'DROP' | 'DONE';

export const getTripPhase = (manifest: ManifestEntry[] | undefined | null): TripPhase => {
  if (!manifest || manifest.length === 0) return 'PICKUP';
  const hasPending = manifest.some((m) => m.status === 'PENDING');
  if (hasPending) return 'PICKUP';
  const hasBoarded = manifest.some((m) => m.status === 'BOARDED');
  if (hasBoarded) return 'DROP';
  return 'DONE';
};

const orderFor = (entry: ManifestEntry, phase: TripPhase): number | null => {
  const stop = phase === 'PICKUP' ? entry.pickupStop : entry.dropStop;
  if (!stop) return null;
  return stop.sequenceOrder ?? null;
};

export const nextStopSequence = (
  manifest: ManifestEntry[] | undefined | null,
  phase: TripPhase,
): number | null => {
  if (!manifest) return null;
  const eligible = manifest.filter((m) =>
    phase === 'PICKUP' ? m.status === 'PENDING' : m.status === 'BOARDED',
  );
  const orders = eligible
    .map((m) => orderFor(m, phase))
    .filter((o): o is number => typeof o === 'number');
  if (orders.length === 0) return null;
  return Math.min(...orders);
};

export const pendingCountAtStop = (
  manifest: ManifestEntry[] | undefined | null,
  sequenceOrder: number,
  phase: TripPhase,
): number => {
  if (!manifest) return 0;
  return manifest.filter((m) => {
    if (phase === 'PICKUP' ? m.status !== 'PENDING' : m.status !== 'BOARDED') return false;
    return orderFor(m, phase) === sequenceOrder;
  }).length;
};

export const myManifestEntry = (
  manifest: ManifestEntry[] | undefined | null,
  customerId: string | undefined,
): ManifestEntry | null => {
  if (!manifest || !customerId) return null;
  return (
    manifest.find((m) => {
      const c = m.customer;
      if (!c) return false;
      const id = typeof c === 'string' ? c : c._id;
      return Boolean(id) && id!.toString() === customerId.toString();
    }) || null
  );
};
