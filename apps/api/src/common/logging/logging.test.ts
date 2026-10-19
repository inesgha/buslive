import { EventEmitter } from 'node:events';

import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { JsonLogger } from './json-logger';
import { redactPath, requestLogger } from './request-logger';

describe('redactPath', () => {
  it('retire les paramètres (positions) et masque les jetons des liens de suivi', () => {
    expect(redactPath('/api/v1/stops/nearby?lat=35.50&lng=11.06')).toBe('/api/v1/stops/nearby');
    expect(redactPath('/t/AbCdEfGhIjKlMnOpQrStUvWxYz012345')).toBe('/t/:token');
    expect(redactPath('/api/v1/trips/AbCdEfGhIjKlMnOpQrStUvWxYz012345')).toBe(
      '/api/v1/trips/:token',
    );
  });

  it('garde les identifiants de ressources (ce ne sont pas des secrets)', () => {
    expect(redactPath('/api/v1/lines/0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d')).toBe(
      '/api/v1/lines/0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d',
    );
  });
});

describe('JsonLogger', () => {
  it('écrit une ligne JSON avec le niveau et le contexte', () => {
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    new JsonLogger().log({ message: 'requête', status: 200 }, 'HTTP');
    const line = String(write.mock.calls[0]?.[0]);
    write.mockRestore();
    expect(JSON.parse(line)).toMatchObject({
      level: 'info',
      context: 'HTTP',
      message: 'requête',
      status: 200,
    });
  });

  it('envoie les erreurs sur la sortie d’erreur, avec la pile', () => {
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    new JsonLogger().error('Échec', 'Error: …\n    at x', 'Service');
    const entry = JSON.parse(String(write.mock.calls[0]?.[0])) as Record<string, unknown>;
    write.mockRestore();
    expect(entry).toMatchObject({ level: 'error', context: 'Service', message: 'Échec' });
    expect(entry.stack).toContain('at x');
  });
});

describe('requestLogger', () => {
  it('ne journalise ni position, ni IP, ni corps, et renvoie un identifiant de requête', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const request = {
      method: 'GET',
      originalUrl: '/api/v1/stops/nearby?lat=35.50123&lng=11.06789',
      headers: { 'x-forwarded-for': '41.230.1.2' },
      body: { password: 'secret' },
      ip: '41.230.1.2',
    };
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
    });
    const next = jest.fn();
    requestLogger()(request as never, response as never, next);
    response.emit('finish');

    expect(next).toHaveBeenCalled();
    expect(response.headers['X-Request-Id']).toMatch(/^[\w-]{8,64}$/);
    const line = JSON.stringify(log.mock.calls[0]?.[0]);
    log.mockRestore();
    for (const secret of ['35.50123', '11.06789', '41.230.1.2', 'secret']) {
      expect(line).not.toContain(secret);
    }
    expect(line).toContain('/api/v1/stops/nearby');
  });
});
