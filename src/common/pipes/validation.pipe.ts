import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

/**
 * Validates a payload against a Zod schema and returns the *parsed* value.
 * Because Zod objects are non-strict by default, unknown keys are dropped
 * rather than passed through — so a client cannot smuggle `role` or
 * `isEmailVerified` into a create/update body (OWASP A01 mass assignment).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
