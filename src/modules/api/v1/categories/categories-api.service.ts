import { Injectable } from '@nestjs/common';
import { CategoryRepository } from 'src/repositories/category.repository';

import { CategoryListResponse } from './response.dto';

@Injectable()
export class CategoriesApiService {
  constructor(private readonly categoryRepo: CategoryRepository) {}

  // Categories are global reference data (no org column) — a curated set the
  // exercise editor offers as multi-select chips.
  async list(): Promise<CategoryListResponse> {
    const categories = await this.categoryRepo.findAll();
    return { data: categories.map((c) => ({ id: c.id, name: c.name })) };
  }
}
