import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ValidationError, validationErrorFactory } from 'src/lib/errors/validation-error';

@Injectable()
export class ClassValidator<T> {
  constructor(protected readonly entityType: { new (): T }) {}

  public validateOrFail(obj: Partial<T>, options?: ValidationOptions) {
    const validationError = this.validate(obj, options);

    if (validationError) {
      throw validationError;
    }
  }

  public validate(obj: Partial<T>, options?: ValidationOptions): ValidationError | null {
    options = options || {};
    let validationError: ValidationError | null = null;

    obj = this.prepareClassForValidation(obj, options);

    const classValidatorValidationErrors = validateSync(obj, {
      skipMissingProperties: options.skipMissingProperties !== undefined ? options.skipMissingProperties : false,
      groups: options.validationGroups || [],
    });

    if (classValidatorValidationErrors && classValidatorValidationErrors.length > 0) {
      validationError = validationErrorFactory(classValidatorValidationErrors, this.entityType.name);
    }

    return validationError;
  }

  protected prepareClassForValidation(obj: Partial<T>, options?: ValidationOptions) {
    const entityWithAttributes: T =
      obj instanceof this.entityType
        ? obj
        : plainToInstance(this.entityType, obj, { enableImplicitConversion: options?.enableImplicitConversion });
    return entityWithAttributes;
  }
}

export class ValidationOptions {
  enableImplicitConversion?: boolean;
  skipMissingProperties?: boolean;
  validationGroups?: string[];
}
