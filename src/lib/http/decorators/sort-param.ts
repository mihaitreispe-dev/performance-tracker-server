import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { buildMessage, isArray, IsOptional, ValidateBy } from 'class-validator';

export const IS_SORT_PARAM = 'IsSortParam';

function extractValues(entity: any): string[] {
  return Object.entries(entity)
    .filter(([key, _value]) => Number.isNaN(Number.parseInt(key)))
    .map(([_key, value]) => value as string);
}

export type SortOptionDirection = 'asc' | 'desc';
export type SortOptions<FieldNames extends string> = Array<{ field: FieldNames; direction?: SortOptionDirection }>;

export function SortParam(
  supportedFields: ArrayLike<string> | { [k: string]: string },
  opts: {
    description?: string;
    example?: any;
    optional?: boolean;
  } = { optional: true },
) {
  const resolvedSupportedFields: string[] = isArray(supportedFields) ? supportedFields : extractValues(supportedFields);

  const description =
    opts?.description ??
    `Comma separated fields to sort. Optionally prefix them with \`-\` for descending or \`+\` for ascending.<br/>Available fields: ${resolvedSupportedFields.join(', ')}.`;

  const example =
    opts.example ??
    (resolvedSupportedFields.length >= 2
      ? `+${resolvedSupportedFields[0]}, -${resolvedSupportedFields[1]}`
      : resolvedSupportedFields.length >= 1
        ? `+${resolvedSupportedFields[0]}`
        : undefined);

  const decorators = [
    opts?.optional
      ? ApiPropertyOptional({ type: String, description, example })
      : ApiProperty({ type: String, description, example }),
    Transform(({ value }) =>
      typeof value === 'string'
        ? value.split(',').map((it: string) => {
            let field = it.trim();
            let direction;
            if (field.startsWith('+')) {
              field = field.substring(1);
              direction = 'asc';
            } else if (field.startsWith('-')) {
              field = field.substring(1);
              direction = 'desc';
            }
            return {
              field,
              direction,
            };
          })
        : value,
    ),
    ValidateBy({
      name: IS_SORT_PARAM,
      constraints: [resolvedSupportedFields],
      validator: {
        validate: (values: Array<{ field: string; direction: string }>) => {
          return (
            values.filter((value) => typeof value.field === 'string' && resolvedSupportedFields.includes(value.field))
              .length === values.length
          );
        },
        defaultMessage: buildMessage((eachPrefix) => eachPrefix + '$property can contain: $constraint1'),
      },
    }),
  ];
  if (opts?.optional) {
    decorators.push(IsOptional());
  }
  return applyDecorators(...decorators);
}
