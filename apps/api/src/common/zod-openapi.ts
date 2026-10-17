import type { ApiBody } from '@nestjs/swagger';
import { z } from 'zod';

/** Type « schema » attendu par @ApiBody (non exporté directement par @nestjs/swagger). */
type OpenApiSchema = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];

/**
 * Convertit un schéma zod en schéma OpenAPI 3.0 pour Swagger, afin de ne pas
 * décrire deux fois le même format.
 *
 *   @ApiBody({ schema: zodToOpenApi(RegisterSchema) })
 *
 * « io: 'input' » décrit ce que le client doit ENVOYER (avant nettoyage et valeurs par défaut).
 */
export function zodToOpenApi(schema: z.ZodType): OpenApiSchema {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as OpenApiSchema;
}
