import 'leaflet/dist/leaflet.css';

import { CircleMarker, MapContainer, TileLayer, Tooltip, useMapEvents } from 'react-leaflet';

/**
 * Couleurs des points. Leaflet les écrit comme attributs SVG, qui n'acceptent
 * pas les variables CSS : d'où des valeurs fixes (celles du thème clair).
 */
export const MAP_COLORS = {
  current: '#0E1B2C',
  proposed: '#B45309',
  other: '#0B7A5E',
} as const;

export interface MapPoint {
  latitude: number;
  longitude: number;
  label: string;
  color: (typeof MAP_COLORS)[keyof typeof MAP_COLORS];
}

interface StopMapProps {
  points: MapPoint[];
  /** Si présent : un clic sur la carte choisit une position. */
  onPick?: (position: { latitude: number; longitude: number }) => void;
}

function PickOnClick({ onPick }: { onPick: NonNullable<StopMapProps['onPick']> }) {
  useMapEvents({
    click: (event) => onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
  });
  return null;
}

/**
 * Carte OpenStreetMap pour vérifier ou corriger une position d'arrêt. Des
 * cercles plutôt que des marqueurs-images : pas de fichiers d'icônes à servir.
 */
export function StopMap({ points, onPick }: StopMapProps) {
  const first = points[0];
  if (!first) return null;
  return (
    <div className="map">
      <MapContainer
        center={[first.latitude, first.longitude]}
        zoom={17}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((point) => (
          <CircleMarker
            key={`${point.label}-${point.latitude}-${point.longitude}`}
            center={[point.latitude, point.longitude]}
            radius={9}
            pathOptions={{ color: point.color, fillColor: point.color, fillOpacity: 0.7 }}
          >
            <Tooltip>{point.label}</Tooltip>
          </CircleMarker>
        ))}
        {onPick ? <PickOnClick onPick={onPick} /> : null}
      </MapContainer>
    </div>
  );
}
