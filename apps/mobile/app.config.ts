import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuration dynamique : reprend app.json et y ajoute ce qui ne doit pas
 * être versionné.
 *
 * google-services.json (Firebase, Android) : nécessaire pour recevoir les
 * notifications push. Son chemin vient de la variable GOOGLE_SERVICES_JSON :
 * - sur EAS Build : variable d'environnement de type « fichier »
 *   (eas env:create --name GOOGLE_SERVICES_JSON --type file …) ;
 * - pour un build local : GOOGLE_SERVICES_JSON=./google-services.json dans .env.local.
 * Sans elle, l'app se construit quand même, mais sans notifications push.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...config,
    name: config.name ?? 'BusLive',
    slug: config.slug ?? 'buslive',
    android: {
      ...config.android,
      ...(googleServicesFile && { googleServicesFile }),
    },
  };
};
