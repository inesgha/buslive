import type { NotificationChannel } from '@buslive/shared';

/** Message push, déjà rédigé dans la langue du destinataire. */
export interface PushMessage {
  title: string;
  body: string;
  /** Canal Android (l'app crée les mêmes canaux). */
  channelId: NotificationChannel;
  /** Données transmises à l'app : valeurs TEXTE uniquement (contrainte de FCM). */
  data: Record<string, string>;
}

export interface PushResult {
  /** Nombre de téléphones qui ont accepté le message. */
  sent: number;
  /** Jetons refusés définitivement (app désinstallée, jeton expiré) : à supprimer. */
  invalidTokens: string[];
}

/**
 * Envoi des notifications push. Trois versions, choisies par PUSH_PROVIDER :
 * FCM (réel), console (développement) et mémoire (tests). Ajouter un autre
 * service (APNs pour l'iPhone, Expo…) revient à écrire une nouvelle version.
 */
export interface PushSender {
  send(tokens: string[], message: PushMessage): Promise<PushResult>;
}

/** Jeton d'injection NestJS (une interface n'existe pas à l'exécution). */
export const PUSH_SENDER = Symbol('PUSH_SENDER');
