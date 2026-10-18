import { router } from 'expo-router';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { registerPushDevice, updateProfile } from '@/api/me';
import { queryKeys } from '@/api/network';
import { queryClient } from '@/api/queryClient';
import { useAuth } from '@/auth/AuthProvider';
import { session } from '@/auth/session';
import { currentLocale } from '@/i18n';

import {
  configureNotifications,
  getDeviceToken,
  getPushPermission,
  onDeviceTokenChange,
  onNotifications,
  type PushPermission,
  type PushSupport,
  pushSupport,
  requestPushPermission,
} from './push';

interface PushContextValue {
  support: PushSupport;
  /** null tant qu'on ne sait pas (ou si les push ne sont pas pris en charge). */
  permission: PushPermission | null;
  /** Le téléphone n'a pas pu être enregistré (ex. build sans Firebase). */
  registrationFailed: boolean;
  /** Demande l'autorisation (à la première alerte, ou depuis le Profil). */
  requestPermission: () => Promise<PushPermission | null>;
}

// Valeur par défaut (tests, ou écran rendu hors du fournisseur) : pas de push.
const PushContext = createContext<PushContextValue>({
  support: 'platform',
  permission: null,
  registrationFailed: false,
  requestPermission: () => Promise.resolve(null),
});

/**
 * Notifications push de l'app :
 * 1. configure l'affichage et les canaux Android ;
 * 2. enregistre le téléphone auprès de l'API quand on est connecté ET autorisé
 *    (à chaque démarrage : l'API sait ainsi qu'il est toujours utilisé) ;
 * 3. ouvre le bon écran quand on touche une notification ;
 * 4. garde la langue du compte égale à celle de l'app (les push sont rédigés
 *    par le serveur, dans la langue du compte).
 */
export function PushProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { state } = useAuth();
  const support = pushSupport();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [registrationFailed, setRegistrationFailed] = useState(false);
  const userId = state.status === 'signedIn' ? state.user.id : null;
  const accountLocale = state.status === 'signedIn' ? state.user.locale : null;

  // 1. Canaux (noms traduits) et autorisation actuelle.
  useEffect(() => {
    if (support !== 'supported') return;
    let cancelled = false;
    void (async () => {
      await configureNotifications({
        approaching: t('notifications.channels.approaching'),
        incidents: t('notifications.channels.incidents'),
        account: t('notifications.channels.account'),
      });
      const current = await getPushPermission();
      if (!cancelled) setPermission(current);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [support, t]);

  // 2. Enregistrement du téléphone (et de ses nouveaux jetons).
  useEffect(() => {
    if (support !== 'supported' || !userId || permission !== 'granted') return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    const register = async (token: string) => {
      await registerPushDevice(token, 'ANDROID');
      if (!cancelled) setRegistrationFailed(false);
    };
    void (async () => {
      try {
        await register(await getDeviceToken());
      } catch {
        if (!cancelled) setRegistrationFailed(true);
      }
      const off = await onDeviceTokenChange((token) => void register(token).catch(() => undefined));
      if (cancelled) off();
      else unsubscribe = off;
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [support, userId, permission]);

  // 3. Notification reçue ou touchée.
  useEffect(() => {
    if (support !== 'supported') return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    const refreshHistory = () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    void onNotifications({
      received: refreshHistory,
      opened: (url) => {
        refreshHistory();
        if (url) router.push(url as Parameters<typeof router.push>[0]);
      },
    })
      .then((off) => {
        if (cancelled) off();
        else unsubscribe = off;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [support]);

  // 4. Langue du compte (ex. langue changée avant de se connecter).
  useEffect(() => {
    if (!accountLocale) return;
    const locale = currentLocale();
    if (accountLocale === locale) return;
    void updateProfile({ locale })
      .then((user) => session.updateProfile(user))
      .catch(() => undefined);
  }, [accountLocale]);

  const requestPermission = useCallback(async () => {
    if (support !== 'supported') return null;
    try {
      const result = await requestPushPermission();
      setPermission(result);
      return result;
    } catch {
      return null;
    }
  }, [support]);

  const value = useMemo(
    () => ({ support, permission, registrationFailed, requestPermission }),
    [support, permission, registrationFailed, requestPermission],
  );
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePush(): PushContextValue {
  return useContext(PushContext);
}
