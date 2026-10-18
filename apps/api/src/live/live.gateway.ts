import { LIVE_EVENTS } from '@buslive/shared';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { z } from 'zod';

import { Public } from '../auth/decorators/public.decorator';
import { LiveBroadcaster, lineRoom } from './live.broadcaster';
import { LiveRegistry } from './live.registry';

const WatchLineSchema = z.object({ lineId: z.uuid() });

/**
 * Socket.io, espace « /live » : les spectateurs (sans compte) suivent les bus
 * d'une ligne.
 *   client → serveur : « watch:line » { lineId } / « unwatch:line » { lineId }
 *   serveur → client : « vehicles » { lineId, vehicles: [...] }
 * L'ENVOI des positions passe par l'API REST (plus fiable en arrière-plan).
 */
@Public()
@WebSocketGateway({ namespace: '/live' })
export class LiveGateway implements OnGatewayInit {
  constructor(
    private readonly registry: LiveRegistry,
    private readonly broadcaster: LiveBroadcaster,
  ) {}

  afterInit(server: Namespace): void {
    this.broadcaster.attach(server);
  }

  @SubscribeMessage(LIVE_EVENTS.watchLine)
  async watchLine(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const parsed = WatchLineSchema.safeParse(body);
    if (!parsed.success) return { ok: false };
    await client.join(lineRoom(parsed.data.lineId));
    // État actuel immédiatement, sans attendre la prochaine diffusion.
    client.emit(LIVE_EVENTS.vehicles, this.registry.lineVehicles(parsed.data.lineId, Date.now()));
    return { ok: true };
  }

  @SubscribeMessage(LIVE_EVENTS.unwatchLine)
  async unwatchLine(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const parsed = WatchLineSchema.safeParse(body);
    if (!parsed.success) return { ok: false };
    await client.leave(lineRoom(parsed.data.lineId));
    return { ok: true };
  }
}
