import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LiveSessionEndReason, PositionBatchResult } from '@buslive/shared';
import { z } from 'zod';

/**
 * État du partage en cours, enregistré sur le téléphone.
 * La tâche de localisation en arrière-plan tourne SANS l'interface React :
 * c'est par ici qu'elle sait vers quel partage envoyer les positions, et
 * qu'elle transmet le dernier résultat à l'écran.
 */
const SharingSchema = z.object({
  sessionId: z.string(),
  lineId: z.string(),
  directionId: z.string(),
  lineCode: z.string(),
  lineColor: z.string(),
  headsignFr: z.string(),
  headsignAr: z.string(),
  /** background : tâche en arrière-plan ; foreground : seulement app ouverte. */
  mode: z.enum(['background', 'foreground']),
});
export type SharingState = z.infer<typeof SharingSchema>;

export interface LastResult {
  onRoute: boolean;
  sharersOnVehicle: number;
  sentAt: string;
  endReason: LiveSessionEndReason | null;
}

const KEYS = {
  sharing: 'buslive.sharing',
  lastResult: 'buslive.sharing.lastResult',
} as const;

export async function loadSharing(): Promise<SharingState | null> {
  const raw = await AsyncStorage.getItem(KEYS.sharing);
  if (!raw) return null;
  const parsed = SharingSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function saveSharing(state: SharingState): Promise<void> {
  await AsyncStorage.setItem(KEYS.sharing, JSON.stringify(state));
  await AsyncStorage.removeItem(KEYS.lastResult);
}

export async function clearSharing(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.sharing, KEYS.lastResult]);
}

export async function saveLastResult(result: PositionBatchResult): Promise<void> {
  const last: LastResult = {
    onRoute: result.onRoute,
    sharersOnVehicle: result.sharersOnVehicle,
    sentAt: new Date().toISOString(),
    endReason: result.session.status === 'ENDED' ? result.session.endReason : null,
  };
  await AsyncStorage.setItem(KEYS.lastResult, JSON.stringify(last));
}

export async function loadLastResult(): Promise<LastResult | null> {
  const raw = await AsyncStorage.getItem(KEYS.lastResult);
  return raw ? (JSON.parse(raw) as LastResult) : null;
}
