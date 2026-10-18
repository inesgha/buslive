import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Adaptateur Socket.io qui applique les mêmes origines CORS que l'API HTTP
 * (CORS_ORIGINS). Le décorateur @WebSocketGateway ne peut pas lire la
 * configuration : on passe donc par l'adaptateur.
 * (Les apps mobiles natives ne sont pas concernées par CORS.)
 */
export class ConfiguredIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    // Les options reçues sont partielles (valeurs par défaut de Socket.io pour le reste).
    const withCors = { ...options, cors: { origin: this.corsOrigins } } as ServerOptions;
    return super.createIOServer(port, withCors);
  }
}
