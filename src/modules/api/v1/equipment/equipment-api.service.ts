import { Injectable } from '@nestjs/common';
import { EquipmentRepository } from 'src/repositories/equipment.repository';

import { CreateEquipmentBody } from './request.dto';
import { EquipmentDTO, EquipmentListResponse } from './response.dto';

@Injectable()
export class EquipmentApiService {
  constructor(private readonly equipmentRepo: EquipmentRepository) {}

  // Equipment is global reference data (no org column) — shared across
  // every tenant so the same "Dumbbells"/"Barbell" tags can be reused.
  async list(): Promise<EquipmentListResponse> {
    const equipment = await this.equipmentRepo.findAll();
    return { data: equipment.map((e) => ({ id: e.id, name: e.name })) };
  }

  async create(body: CreateEquipmentBody): Promise<EquipmentDTO> {
    // Idempotent: reuse an existing equipment row with the same name
    // rather than creating duplicates.
    const equipment = await this.equipmentRepo.findOrCreate(body.name.trim());
    return { id: equipment.id, name: equipment.name };
  }
}
