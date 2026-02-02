import { ApiError } from 'src/lib/errors/api-error';

export class EntityNotFoundError extends ApiError {
  constructor(entityClassName: string, entityId?: string) {
    super('NotFound', EntityNotFoundError.name, {
      target: entityClassName,
      details: [
        {
          code: 'NotFound',
          message: entityId ? `${entityClassName} id= ${entityId} not found` : `${entityClassName}s not found`,
          target: entityId,
        },
      ],
    });
  }
}

export class EntityIncompletePatchError extends ApiError {
  constructor(entityClassName: string, extra: { ok: number; matchedCount: number; updatedCount: number }) {
    super('EntityIncompletePatch', EntityIncompletePatchError.name, {
      target: entityClassName,
      details: [
        {
          code: 'EntityIncompletePatch',
          message: `ok: ${extra.ok}; matchedCount: ${extra.matchedCount}; updatedCount: ${extra.matchedCount}`,
        },
      ],
    });
  }
}

export class EntityIncompleteDeleteError extends ApiError {
  constructor(entityClassName: string, extra: { ok?: number; matchedCount?: number; updatedCount?: number }) {
    super('EntityIncompleteDelete', EntityIncompleteDeleteError.name, {
      target: entityClassName,
      details: [
        {
          target: entityClassName,
          code: 'EntityIncompleteDelete',
          message: `ok: ${extra.ok}; matchedCount: ${extra.matchedCount}; updatedCount: ${extra.matchedCount}`,
        },
      ],
    });
  }
}
