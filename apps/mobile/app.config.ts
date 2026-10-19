import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuration dynamique : reprend app.json et y ajoute ce qui ne doit pas
 * être versionné. Les valeurs viennent de variables d'environnement :
 * - sur EAS Build : variables de l'environnement EAS (development, preview,
 *   production), créées avec « eas env:create » ;
 * - pour un build local : apps/mobile/.env.local.
 *
 * GOOGLE_SERVICES_JSON (fichier) : google-services.json de Firebase, pour les
 * notifications push. Sans lui, l'app se construit, mais sans push.
 *
 * GOOGLE_MAPS_API_KEY : clé « Maps SDK for Android », OBLIGATOIRE pour que la
 * carte s'affiche dans une version publiée (Expo Go et le build de
 * développement s'en passent). À restreindre à l'app dans Google Cloud
 * (nom de package + empreinte SHA-1 de la clé de signature).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  return {
    ...config,
    name: config.name ?? 'BusLive',
    slug: config.slug ?? 'buslive',
    android: {
      ...config.android,
      ...(googleServicesFile && { googleServicesFile }),
      ...(googleMapsApiKey && {
        config: { ...config.android?.config, googleMaps: { apiKey: googleMapsApiKey } },
      }),
    },
  };
};
