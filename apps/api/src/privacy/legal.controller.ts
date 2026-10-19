import type { Locale } from '@buslive/shared';
import { Controller, Get, Header, Headers, Query, VERSION_NEUTRAL } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';
import type { Env } from '../config/env.schema';
import { accountDeletionPage, privacyPage } from './legal-pages';

/** Langue : ?lang=ar, sinon celle du navigateur, sinon le français. */
export function pageLocale(lang: string | undefined, acceptLanguage: string | undefined): Locale {
  if (lang === 'ar' || lang === 'fr') return lang;
  return acceptLanguage?.trim().toLowerCase().startsWith('ar') ? 'ar' : 'fr';
}

/**
 * Pages légales publiques (servies hors du préfixe /api/v1, voir setup-app.ts) :
 * leurs adresses sont données à Google Play et affichées dans l'app.
 */
@ApiExcludeController()
@Public()
@Controller({ path: 'legal', version: VERSION_NEUTRAL })
export class LegalController {
  private readonly contactEmail?: string;

  constructor(config: ConfigService<Env, true>) {
    this.contactEmail = config.get('CONTACT_EMAIL', { infer: true });
  }

  @Get('privacy')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  privacy(@Query('lang') lang?: string, @Headers('accept-language') accept?: string): string {
    return privacyPage(pageLocale(lang, accept), this.contactEmail);
  }

  @Get('account-deletion')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  accountDeletion(
    @Query('lang') lang?: string,
    @Headers('accept-language') accept?: string,
  ): string {
    return accountDeletionPage(pageLocale(lang, accept), this.contactEmail);
  }
}
