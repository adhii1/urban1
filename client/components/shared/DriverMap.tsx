'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface ShuttleStopMarker {
  coordinates: [number, number];
  type: 'PICKUP' | 'DROP';
  label: string;
  status: 'PENDING' | 'COMPLETED';
  sequenceOrder: number;
}

interface DriverMapProps {
  driverLocation?: { coordinates: [number, number] };
  pickupLocation?: { coordinates: [number, number] };
  dropLocation?: { coordinates: [number, number] };
  status?: string;
  height?: string;
  allStops?: ShuttleStopMarker[];
  showRouteLine?: boolean;
}

const PICKUP_COLOR = '#16C15D';
const DROP_COLOR = '#EF4444';
const COMPLETED_COLOR = '#64748B';
const ROUTE_COLOR = '#2563EB';

function makeStopIcon(stop: ShuttleStopMarker): L.DivIcon {
  const color = stop.status === 'COMPLETED'
    ? COMPLETED_COLOR
    : stop.type === 'PICKUP' ? PICKUP_COLOR : DROP_COLOR;
  const shape = stop.type === 'PICKUP'
    ? `<div style="width:28px;height:28px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;">${stop.sequenceOrder}</div>`
    : `<div style="width:28px;height:28px;background:${color};border:3px solid white;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;">${stop.sequenceOrder}</div>`;
  return L.divIcon({
    className: 'shuttle-stop-marker',
    html: shape,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function DriverMap({
  driverLocation,
  pickupLocation,
  dropLocation,
  status,
  height = '300px',
  allStops,
  showRouteLine = true,
}: DriverMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current).setView([12.9716, 77.5946], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    if (allStops && allStops.length > 0) {
      const bounds: L.LatLngTuple[] = [];

      if (driverLocation) {
        const [dlng, dlat] = driverLocation.coordinates;
        const driverIcon = L.divIcon({
          className: 'driver-marker',
          html: `<div style="width:36px;height:36px;background:#2563EB;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
          </div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        const driverMarker = L.marker([dlat, dlng], { icon: driverIcon })
          .bindPopup('Driver Location')
          .addTo(map);
        markersRef.current.push(driverMarker);
        bounds.push([dlat, dlng]);
      }

      for (const stop of allStops) {
        const [lng, lat] = stop.coordinates;
        const marker = L.marker([lat, lng], { icon: makeStopIcon(stop) })
          .bindPopup(`<b>${stop.label}</b><br/>${stop.type === 'PICKUP' ? 'Pickup' : 'Drop'} #${stop.sequenceOrder}<br/>${stop.status === 'COMPLETED' ? 'Done' : 'Pending'}`)
          .addTo(map);
        markersRef.current.push(marker);
        bounds.push([lat, lng]);
      }

      if (showRouteLine && allStops.length >= 2) {
        const pendingStops = allStops.filter((s) => s.status === 'PENDING');
        if (pendingStops.length >= 2) {
          const lineCoords: L.LatLngExpression[] = pendingStops.map((s) => [s.coordinates[1], s.coordinates[0]]);
          polylineRef.current = L.polyline(lineCoords, {
            color: ROUTE_COLOR,
            weight: 3,
            opacity: 0.6,
            dashArray: '8, 8',
          }).addTo(map);
        }
      }

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [40, 40] });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 15);
      }
      return;
    }

    if (driverLocation) {
      const [dlng, dlat] = driverLocation.coordinates;
      const latlng: L.LatLngTuple = [dlat, dlng];
      const driverIcon = L.divIcon({
        className: 'driver-marker',
        html: `<div style="width:36px;height:36px;background:#16C15D;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      const driverMarker = L.marker(latlng, { icon: driverIcon }).addTo(map);
      markersRef.current.push(driverMarker);

      if (pickupLocation) {
        const [plng, plat] = pickupLocation.coordinates;
        const pickupIcon = L.divIcon({
          className: 'pickup-marker',
          html: `<div style="width:28px;height:28px;background:#16C15D;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        markersRef.current.push(L.marker([plat, plng], { icon: pickupIcon }).bindPopup('Pickup').addTo(map));
      }

      if (dropLocation) {
        const [drlng, drlat] = dropLocation.coordinates;
        const dropIcon = L.divIcon({
          className: 'drop-marker',
          html: `<div style="width:28px;height:28px;background:#EF4444;border:3px solid white;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        markersRef.current.push(L.marker([drlat, drlng], { icon: dropIcon }).bindPopup('Drop').addTo(map));
      }

      const bounds: L.LatLngTuple[] = [latlng];
      if (pickupLocation) bounds.push([pickupLocation.coordinates[1], pickupLocation.coordinates[0]]);
      if (dropLocation) bounds.push([dropLocation.coordinates[1], dropLocation.coordinates[0]]);
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [50, 50] });
      } else {
        map.setView(latlng, 15);
      }

      if (showRouteLine) {
        const linePoints: L.LatLngExpression[] = [];
        if (pickupLocation) linePoints.push([pickupLocation.coordinates[1], pickupLocation.coordinates[0]]);
        if (driverLocation && status === 'DRIVER_ARRIVING') {
          linePoints.push([driverLocation.coordinates[1], driverLocation.coordinates[0]]);
        }
        if (dropLocation && status === 'IN_PROGRESS') {
          linePoints.push([dropLocation.coordinates[1], dropLocation.coordinates[0]]);
        }
        if (linePoints.length >= 2) {
          polylineRef.current = L.polyline(linePoints, {
            color: '#16C15D', weight: 4, opacity: 0.7, dashArray: '10, 10',
          }).addTo(map);
        }
      }
    }
  }, [driverLocation, pickupLocation, dropLocation, status, allStops, showRouteLine]);

  return (
    <div
      ref={mapRef}
      style={{
        width: '100%',
        height,
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #E2E8F0',
      }}
    />
  );
}
