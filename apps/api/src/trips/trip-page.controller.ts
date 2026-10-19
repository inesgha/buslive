import { Controller, Get, Header, Param, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';
import { TRIP_PAGE_HTML, TRIP_PAGE_SCRIPT } from './trip-page';
import { TokenPipe } from './trips.controller';

/**
 * Page web de suivi, ouverte par la personne qui a reçu le lien (sans l'app).
 * Servie HORS du préfixe /api/v1 (voir setup-app.ts) : le lien reste court.
 * La page ne contient aucune donnée : elle les lit sur /api/v1/trips/:token.
 */
@ApiExcludeController()
@Public()
@Controller({ path: 't', version: VERSION_NEUTRAL })
export class TripPageController {
  @Get('assets/trip.js')
  @Header('Content-Type', 'text/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  script(): string {
    return TRIP_PAGE_SCRIPT;
  }

  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  // Le jeton est dans l'adresse : ni cache partagé, ni référent, ni indexation.
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  page(@Param('token', TokenPipe) _token: string): string {
    return TRIP_PAGE_HTML;
  }
}
