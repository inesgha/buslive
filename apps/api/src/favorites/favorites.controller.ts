import { type Favorites, FavoritesSchema } from '@buslive/shared';
import { Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { zodToOpenApi } from '../common/zod-openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FavoritesService } from './favorites.service';

const UuidPipe = new ZodValidationPipe(z.uuid('Identifiant invalide.'));

/**
 * Favoris de l'utilisateur connecté. PUT ajoute, DELETE retire : les deux sont
 * idempotents (répéter la requête donne le même résultat).
 */
@ApiTags('Favoris')
@ApiBearerAuth()
@Controller('me/favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: 'Mes lignes et arrêts favoris' })
  @ApiOkResponse({ schema: zodToOpenApi(FavoritesSchema, 'output') })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Favorites> {
    return this.favorites.list(user.id);
  }

  @Put('lines/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Ajouter une ligne aux favoris' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Limite de favoris atteinte.' })
  addLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
  ): Promise<void> {
    return this.favorites.addLine(user.id, id);
  }

  @Delete('lines/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Retirer une ligne des favoris' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  removeLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
  ): Promise<void> {
    return this.favorites.removeLine(user.id, id);
  }

  @Put('stops/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Ajouter un arrêt aux favoris' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Limite de favoris atteinte.' })
  addStop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
  ): Promise<void> {
    return this.favorites.addStop(user.id, id);
  }

  @Delete('stops/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Retirer un arrêt des favoris' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  removeStop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidPipe) id: string,
  ): Promise<void> {
    return this.favorites.removeStop(user.id, id);
  }
}
