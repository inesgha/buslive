import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Paramètres argon2id (minimum recommandé par l'OWASP : 19 Mio de mémoire,
 * 2 itérations, 1 fil). Ce sont aussi les valeurs par défaut de @node-rs/argon2 ;
 * on les fixe explicitement pour qu'une mise à jour de la bibliothèque ne les
 * change pas sans qu'on le voie. L'algorithme par défaut est argon2id.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class PasswordService {
  /**
   * Empreinte d'un mot de passe factice, utilisée quand l'email n'existe pas :
   * on fait quand même une vérification argon2 pour que le temps de réponse ne
   * révèle pas si un compte existe.
   */
  private readonly dummyHash = hash('buslive-mot-de-passe-factice', ARGON2_OPTIONS);

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      // Empreinte corrompue ou format inconnu : on refuse.
      return false;
    }
  }

  /** Vérification « à blanc » qui prend le même temps qu'une vraie. Renvoie toujours false. */
  async verifyDummy(password: string): Promise<false> {
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
