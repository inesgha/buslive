import { NOTIFICATION_CHANNELS, type NotificationChannel } from '@buslive/shared';
import type * as NotificationsModule from 'expo-notifications';
import { Platform } from 'react-native';

import { unregisterPushDevice } from '@/api/me';
import { isExpoGo } from '@/live/environment';

/**
 * Accès aux notifications natives (expo-notifications), isolé ici.
 *
 * Le module est chargé À LA DEMANDE : dans Expo Go, on ne le charge jamais
 * (il y afficherait un avertissement à chaque démarrage, et la récupération du
 * jeton y lève une erreur sur Android).
 */

/**
 * Les notifications push peuvent-elles fonctionner ici ?
 * - « expoGo » : Expo a retiré les push d'Expo Go sur Android (SDK 53) ;
 *   il faut le build de développement (EAS) ;
 * - « platform » : iPhone pas encore pris en charge (son jeton est un jeton
 *   Apple, et l'API n'envoie que par FCM) ;
 * - « supported » : build de développement ou app publiée, sur Android.
 */
export type PushSupport = 'supported' | 'expoGo' | 'platform';

export function pushSupport(): PushSupport {
  if (Platform.OS !== 'android') return 'platform';
  if (isExpoGo()) return 'expoGo';
  return 'supported';
}

export type PushPermission = 'granted' | 'denied' | 'undetermined';

type Notifications = typeof NotificationsModule;
let loaded: Promise<Notifications> | null = null;

function load(): Promise<Notifications> {
  loaded ??= import('expo-notifications');
  return loaded;
}

/**
 * Affichage des notifications reçues app ouverte, et canaux Android (mêmes
 * identifiants que ceux choisis par l'API, voir channelFor). Les noms des
 * canaux apparaissent dans les réglages du téléphone : ils sont traduits.
 */
export async function configureNotifications(
  channelNames: Record<NotificationChannel, string>,
): Promise<void> {
  const Notifications = await load();
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
  });
  await Promise.all(
    NOTIFICATION_CHANNELS.map((id) =>
      Notifications.setNotificationChannelAsync(id, {
        name: channelNames[id],
        // « Bus qui approche » s'affiche en haut de l'écran : c'est urgent.
        importance:
          id === 'approaching'
            ? Notifications.AndroidImportance.HIGH
            : Notifications.AndroidImportance.DEFAULT,
      }),
    ),
  );
}

export async function getPushPermission(): Promise<PushPermission> {
  const { status } = await (await load()).getPermissionsAsync();
  return status as PushPermission;
}

/** Affiche la demande du système (Android 13+). */
export async function requestPushPermission(): Promise<PushPermission> {
  const { status } = await (await load()).requestPermissionsAsync();
  return status as PushPermission;
}

/** Jeton FCM du téléphone. Échoue si le build n'a pas de google-services.json. */
export async function getDeviceToken(): Promise<string> {
  const { data } = await (await load()).getDevicePushTokenAsync();
  return String(data);
}

/** FCM peut renouveler le jeton : il faut alors le renvoyer à l'API. */
export async function onDeviceTokenChange(listener: (token: string) => void): Promise<() => void> {
  const subscription = (await load()).addPushTokenListener((token) => listener(String(token.data)));
  return () => subscription.remove();
}

/** Écran interne à ouvrir (« url » envoyée par l'API), ou null. */
function urlOf(response: NotificationsModule.NotificationResponse): string | null {
  const url = response.notification.request.content.data?.url;
  // Seuls les chemins internes de l'app sont acceptés.
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}

/**
 * Notification reçue (app ouverte) et notification touchée (y compris celle
 * qui a lancé l'app). Renvoie la fonction de désabonnement.
 */
export async function onNotifications(handlers: {
  received: () => void;
  opened: (url: string | null) => void;
}): Promise<() => void> {
  const Notifications = await load();
  const received = Notifications.addNotificationReceivedListener(() => handlers.received());
  const opened = Notifications.addNotificationResponseReceivedListener((response) =>
    handlers.opened(urlOf(response)),
  );
  const launch = await Notifications.getLastNotificationResponseAsync();
  if (launch) {
    handlers.opened(urlOf(launch));
    await Notifications.clearLastNotificationResponseAsync();
  }
  return () => {
    received.remove();
    opened.remove();
  };
}

/**
 * À la déconnexion : ce téléphone ne doit plus recevoir les notifications du
 * compte. « Au mieux » et limité à 3 s : hors ligne, la déconnexion n'attend
 * pas (le jeton sera réattribué au prochain compte, ou oublié après 60 jours).
 */
export async function unregisterThisDevice(): Promise<void> {
  if (pushSupport() !== 'supported') return;
  try {
    const token = await getDeviceToken();
    await Promise.race([
      unregisterPushDevice(token),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // Pas de jeton (build sans Firebase) ou pas de réseau : rien à faire.
  }
}
