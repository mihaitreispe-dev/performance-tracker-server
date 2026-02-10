import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { CardioCategory } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { CardioCategoryRepository } from 'src/repositories/cardio-category.repository';

import { CreateCardioCategoryBody, ListCardioCategoriesQuery } from './request.dto';
import { CardioCategoryDTO, CardioCategoryListResponse, CardioCategoryResponse } from './response.dto';

@Injectable()
export class CardioCategoriesApiService {
  constructor(private readonly cardioCategoryRepo: CardioCategoryRepository) {}

  async list(req: Request & { user: AuthUser }, query: ListCardioCategoriesQuery): Promise<CardioCategoryListResponse> {
    const categories = await this.cardioCategoryRepo.findMany({
      sportType: query.sportType,
      userId: req.user.id,
    });

    return {
      data: categories.map((c) => this.mapCategoryToDTO(c)),
    };
  }

  async create(req: Request & { user: AuthUser }, body: CreateCardioCategoryBody): Promise<CardioCategoryResponse> {
    const category = await this.cardioCategoryRepo.create({
      sport_type: body.sportType,
      name: body.name,
      user_id: req.user.id,
    });

    return {
      data: this.mapCategoryToDTO(category),
    };
  }

  async delete(req: Request & { user: AuthUser }, id: string): Promise<void> {
    const category = await this.cardioCategoryRepo.findById(id);
    if (!category) {
      throw new NotFoundException();
    }

    // Only allow deleting user-created categories
    if (category.user_id === null) {
      throw new ForbiddenException('Cannot delete system default categories');
    }

    // Only allow deleting own categories
    if (category.user_id !== req.user.id) {
      throw new NotFoundException();
    }

    await this.cardioCategoryRepo.deleteById(id);
  }

  private mapCategoryToDTO(category: CardioCategory): CardioCategoryDTO {
    return {
      id: category.id,
      sportType: category.sport_type,
      name: category.name,
      userId: category.user_id,
      createdAt: new Date(category.created_at as unknown as string).toISOString(),
    };
  }
}
