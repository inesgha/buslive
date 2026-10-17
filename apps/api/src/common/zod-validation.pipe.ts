import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Valide (et nettoie) une valeur entrante avec un schéma zod.
 *
 *   @Body(new ZodValidationPipe(RegisterSchema)) body: RegisterInput
 *
 * En cas d'erreur, répond 400 avec la liste des champs fautifs. Le « code » zod
 * (too_small, invalid_format…) permet à l'app mobile d'afficher un message traduit.
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Données invalides.',
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
