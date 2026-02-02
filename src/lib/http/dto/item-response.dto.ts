import { IsObject, ValidateNested } from 'class-validator';

/**
 * Single item response envelope. All item responses need to be wrapped by this.
 * */
export class ItemResponse<TItem> {
  constructor(params: { data: TItem }) {
    this.data = params.data;
  }

  @IsObject({ always: true })
  @ValidateNested()
  // Add OpenAPI to subclasses, since it can't infer the generic TItem type
  data: TItem;
}
