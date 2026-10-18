import type { MapStyleElement } from 'react-native-maps';

/**
 * Style Google Maps pour le mode sombre (fond bleu nuit, routes discrètes),
 * proche des couleurs de l'app. En mode clair, on garde le style par défaut.
 */
export const darkMapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#14243A' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#A9B6C4' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B1522' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#24364F' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2E4566' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0B1522' }] },
];
