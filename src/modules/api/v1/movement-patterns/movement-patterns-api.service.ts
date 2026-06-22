import { Injectable } from '@nestjs/common';
import { MovementPatternRepository } from 'src/repositories/movement-pattern.repository';

import { MovementPatternListResponse } from './response.dto';

@Injectable()
export class MovementPatternsApiService {
  constructor(private readonly movementPatternRepo: MovementPatternRepository) {}

  // Global reference list offered as the exercise editor's movement-pattern picker.
  async list(): Promise<MovementPatternListResponse> {
    const patterns = await this.movementPatternRepo.findAll();
    return { data: patterns.map((p) => ({ id: p.id, name: p.name })) };
  }
}
