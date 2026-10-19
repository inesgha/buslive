import type { LoggerService, LogLevel } from '@nestjs/common';

/**
 * Journal au format JSON, une ligne par événement (production) : facile à
 * filtrer (`docker compose logs api | grep '"level":"error"'`) et à envoyer
 * plus tard vers un outil d'analyse. Jamais de données personnelles dans les
 * messages : voir redactPath et le middleware des requêtes.
 */
export class JsonLogger implements LoggerService {
  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('verbose', message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }

  private write(level: LogLevel | 'info', message: unknown, params: unknown[]): void {
    // Convention NestJS : le dernier paramètre texte est le contexte (nom du service).
    const context = typeof params.at(-1) === 'string' ? (params.at(-1) as string) : undefined;
    const rest = context ? params.slice(0, -1) : params;
    const entry: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      ...(context && { context }),
      ...(isRecord(message) ? message : { message: String(message) }),
    };
    // Pour une erreur, Nest passe la pile d'appels en paramètre.
    const stack = rest.find((param) => typeof param === 'string');
    if (stack) entry.stack = stack;
    const line = `${JSON.stringify(entry)}\n`;
    if (level === 'error' || level === 'fatal') process.stderr.write(line);
    else process.stdout.write(line);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !(value instanceof Error);
}
