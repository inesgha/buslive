import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Chemin d'une requête, sans rien de personnel ou de secret :
 * - les paramètres (« ?lat=…&lng=… ») sont retirés : ils peuvent contenir une position ;
 * - les jetons des liens de suivi (/t/<jeton>, /trips/<jeton>) sont masqués.
 */
export function redactPath(url: string): string {
  const path = url.split('?')[0] ?? '';
  return path
    .replace(/\/t\/[^/]+/, '/t/:token')
    .replace(/\/trips\/[A-Za-z0-9_-]{32}(?=\/|$)/, '/trips/:token');
}

/** Identifiant transmis par le proxy, s'il est raisonnable ; sinon un nouveau. */
function requestIdOf(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value && /^[\w-]{8,64}$/.test(value) ? value : randomUUID();
}

/**
 * Une ligne de journal par requête : méthode, chemin (sans données
 * personnelles), statut, durée et identifiant de requête. L'identifiant est
 * renvoyé dans l'en-tête X-Request-Id : une personne qui signale un problème
 * peut le donner, et on retrouve la requête dans le journal.
 * Ni corps, ni en-têtes, ni adresse IP ne sont journalisés.
 */
export function requestLogger() {
  const logger = new Logger('HTTP');
  return (request: Request, response: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    const requestId = requestIdOf(request.headers['x-request-id']);
    response.setHeader('X-Request-Id', requestId);
    response.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      logger.log({
        message: 'requête',
        requestId,
        method: request.method,
        path: redactPath(request.originalUrl),
        status: response.statusCode,
        ms: Math.round(ms),
      });
    });
    next();
  };
}
