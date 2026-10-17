import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ name: z.string().trim().min(2) }));

  it('renvoie la valeur nettoyée quand elle est valide', () => {
    expect(pipe.transform({ name: '  Inès  ', extra: true })).toEqual({ name: 'Inès' });
  });

  it('lève une 400 détaillant les champs fautifs', () => {
    try {
      pipe.transform({ name: 'a' });
      throw new Error('aurait dû échouer');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        errors: { path: string; code: string }[];
      };
      expect(body.errors).toEqual([expect.objectContaining({ path: 'name', code: 'too_small' })]);
    }
  });
});
