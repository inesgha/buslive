import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRtl, type Locale } from '@buslive/shared';
import { reloadAppAsync } from 'expo';
import { I18nManager } from 'react-native';

/**
 * Sens d'écriture (gauche → droite pour le français, droite → gauche pour l'arabe).
 *
 * React Native inverse toute l'interface en RTL grâce à I18nManager. Mais le
 * sens n'est lu qu'au DÉMARRAGE de l'app : après un changement, il faut
 * redémarrer. D'où les fonctions ci-dessous.
 */

const RELOAD_GUARD_KEY = 'buslive.directionReload';

/**
 * Demande au système le sens correspondant à la langue.
 * Renvoie true si le sens actuel est différent (un redémarrage est nécessaire).
 */
export function requestDirection(locale: Locale): boolean {
  const rtl = isRtl(locale);
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.forceRTL(rtl);
  return true;
}

export function restartApp(): Promise<void> {
  return reloadAppAsync('Changement du sens d’écriture');
}

/**
 * Au démarrage : aligne le sens sur la langue, en redémarrant une fois si besoin.
 * Un garde-fou évite une boucle de redémarrages si le système refuse le changement.
 * Renvoie 'restarting' si l'app est en train de redémarrer.
 */
export async function ensureDirection(locale: Locale): Promise<'ready' | 'restarting'> {
  if (!requestDirection(locale)) {
    await AsyncStorage.removeItem(RELOAD_GUARD_KEY);
    return 'ready';
  }

  const wanted = isRtl(locale) ? 'rtl' : 'ltr';
  if ((await AsyncStorage.getItem(RELOAD_GUARD_KEY)) === wanted) {
    // Déjà tenté une fois sans succès : on continue dans le sens actuel.
    console.warn(
      `Impossible d'appliquer le sens « ${wanted} » : l'interface garde le sens actuel.`,
    );
    return 'ready';
  }

  await AsyncStorage.setItem(RELOAD_GUARD_KEY, wanted);
  await restartApp();
  return 'restarting';
}
