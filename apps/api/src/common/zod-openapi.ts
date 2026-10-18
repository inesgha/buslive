import type { ApiBody } from '@nestjs/swagger';
import { z } from 'zod';

/** Type « schema » attendu par @ApiBody / @ApiOkResponse (non exporté directement par @nestjs/swagger). */
type OpenApiSchema = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];

/**
 * Convertit un schéma zod en schéma OpenAPI 3.0 pour Swagger, afin de ne pas
 * décrire deux fois le même format.
 *
 *   @ApiBody({ schema: zodToOpenApi(RegisterSchema) })                  // ce que le client ENVOIE
 *   @ApiOkResponse({ schema: zodToOpenApi(LineDetailSchema, 'output') }) // ce que l'API RENVOIE
 *
 * « input » décrit les données avant nettoyage et valeurs par défaut ; « output » après.
 */
export function zodToOpenApi(schema: z.ZodType, io: 'input' | 'output' = 'input'): OpenApiSchema {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io }) as OpenApiSchema;
}
