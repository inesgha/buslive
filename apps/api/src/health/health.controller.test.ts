import { LivenessResponseSchema } from '@buslive/shared';
// En mode ESM, « jest » s'importe explicitement (voir jest.base.cjs).
import { jest } from '@jest/globals';
import { HealthCheckService } from '@nestjs/terminus';
import { Test } from '@nestjs/testing';

import { HealthController } from './health.controller';
import { PostgisHealthIndicator } from './postgis.health';

type Indicator = () => unknown;

describe('HealthController', () => {
  let controller: HealthController;
  // Doublures (mocks) typées des dépendances du contrôleur.
  const healthCheckService = {
    check: jest.fn<(indicators: Indicator[]) => Promise<unknown>>(),
  };
  const postgisIndicator = { isHealthy: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Module de test : on remplace les dépendances par les doublures,
    // pour tester le contrôleur sans base de données.
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: PostgisHealthIndicator, useValue: postgisIndicator },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('live() renvoie une réponse conforme au schéma partagé', () => {
    const response = controller.live();
    expect(LivenessResponseSchema.safeParse(response).success).toBe(true);
  });

  it('ready() délègue la vérification à PostGIS via Terminus', async () => {
    healthCheckService.check.mockImplementation(async (indicators) => {
      await Promise.all(indicators.map((indicator) => indicator()));
      return { status: 'ok' };
    });

    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    expect(postgisIndicator.isHealthy).toHaveBeenCalledTimes(1);
  });
});
