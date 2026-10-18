import { FcmPushSender } from './fcm-push-sender';
import { MemoryPushSender } from './memory-push-sender';
import type { PushMessage } from './push-sender';

const message: PushMessage = {
  title: 'BusLive',
  body: 'Essai',
  channelId: 'account',
  data: { type: 'TEST', url: '/alerts' },
};

describe('FcmPushSender', () => {
  it('refuse de démarrer sans clé Firebase (message clair dès le lancement)', () => {
    expect(() => new FcmPushSender('./secrets/introuvable.json')).toThrow(
      /Clé Firebase introuvable/,
    );
  });
});

describe('MemoryPushSender', () => {
  it('garde les messages et signale les jetons invalides', async () => {
    const sender = new MemoryPushSender();
    sender.invalid.add('mort');
    await expect(sender.send(['vivant', 'mort'], message)).resolves.toEqual({
      sent: 1,
      invalidTokens: ['mort'],
    });
    expect(sender.sent).toEqual([{ tokens: ['vivant', 'mort'], message }]);
  });
});
