import { ValidationError as NestValidationError } from '@nestjs/common';
import { flatMap } from 'lodash';
import { ApiError, ApiErrorDetails } from 'src/lib/errors/api-error';

export class ValidationError extends ApiError {
  constructor(message: string, extra: { target?: string; details?: ApiErrorDetails[] } = {}) {
    super(ValidationError.name, message, { target: extra.target, details: extra.details });
  }
}

function reduceConstraints(error: NestValidationError, parentPath: string = '') {
  let details: { code: string; message: string; target: string }[] = [];
  Number.isInteger(+error.property);

  const formattedProperty = Number.isInteger(+error.property)
    ? `[${error.property}]`
    : `${parentPath ? '.' : ''}${error.property}`;

  for (const [_, detail] of Object.entries(error.constraints ?? [])) {
    details = details.concat({
      code: 'ConstraintError',
      message: detail,
      target: `${parentPath}${formattedProperty}`,
    });
  }

  for (const child of error.children ?? []) {
    details = details.concat(reduceConstraints(child, `${parentPath}${formattedProperty}`));
  }
  return details;
}

export const validationErrorFactory = (errors: NestValidationError[], mainTarget?: string) => {
  const defaultMainTarget = errors[0]?.target?.constructor.name ?? '';
  return new ValidationError(ValidationError.name, {
    target: mainTarget ?? defaultMainTarget,
    details: flatMap(errors, (error) => reduceConstraints(error)),
  });
};
