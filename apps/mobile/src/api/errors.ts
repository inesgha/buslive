/** Erreurs possibles lors d'un appel à l'API, pour les afficher clairement. */

export interface ApiIssue {
  path: string;
  code: string;
  message: string;
}

/** L'API a répondu avec un code d'erreur (400, 401, 409, 429…). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Détail des champs invalides (réponses 400 du ZodValidationPipe). */
    readonly issues: ApiIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromBody(status: number, body: unknown): ApiError {
    const data = (body ?? {}) as { message?: unknown; errors?: unknown };
    const message = typeof data.message === 'string' ? data.message : `Erreur HTTP ${status}`;
    const issues = Array.isArray(data.errors) ? (data.errors as ApiIssue[]) : [];
    return new ApiError(status, message, issues);
  }
}

/** Le serveur est injoignable (pas de réseau, mauvaise adresse, délai dépassé…). */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Serveur injoignable.', { cause });
    this.name = 'NetworkError';
  }
}

/** La réponse ne respecte pas le format attendu (API et app pas à jour l'une par rapport à l'autre). */
export class InvalidResponseError extends Error {
  constructor(path: string, details: string) {
    super(`Réponse inattendue de ${path} : ${details}`);
    this.name = 'InvalidResponseError';
  }
}
