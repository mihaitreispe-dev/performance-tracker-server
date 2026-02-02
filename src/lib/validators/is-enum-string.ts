import { applyDecorators } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';

export function IsEnumString<T>(o: { [s: string]: T } | ArrayLike<T>) {
  return applyDecorators(
    IsString(),
    Matches(
      Object.values(o)
        .filter((v) => typeof v !== 'number')
        .map((it) => `^${it}$`)
        .join('|'),
    ),
  );
}
