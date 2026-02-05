import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, Equipment, NewEquipment } from 'src/database/interfaces';

@Injectable()
export class EquipmentRepository {
  constructor(@InjectKysely() protected readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<Equipment | undefined> {
    return this.db.selectFrom('equipment').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByName(name: string): Promise<Equipment | undefined> {
    return this.db.selectFrom('equipment').where('name', '=', name).selectAll().executeTakeFirst();
  }

  async findAll(): Promise<Equipment[]> {
    return this.db.selectFrom('equipment').selectAll().orderBy('name', 'asc').execute();
  }

  async create(data: NewEquipment): Promise<Equipment> {
    return this.db.insertInto('equipment').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async findOrCreate(name: string): Promise<Equipment> {
    const existing = await this.findByName(name);
    if (existing) {
      return existing;
    }
    return this.create({ name });
  }

  async linkToExercise(exerciseId: string, equipmentId: string): Promise<void> {
    await this.db
      .insertInto('exercise_equipment')
      .values({ exercise_id: exerciseId, equipment_id: equipmentId })
      .onConflict((oc) => oc.columns(['exercise_id', 'equipment_id']).doNothing())
      .execute();
  }

  async findByExerciseId(exerciseId: string): Promise<Equipment[]> {
    return this.db
      .selectFrom('equipment')
      .innerJoin('exercise_equipment', 'equipment.id', 'exercise_equipment.equipment_id')
      .where('exercise_equipment.exercise_id', '=', exerciseId)
      .selectAll('equipment')
      .execute();
  }

  async unlinkFromExercise(exerciseId: string, equipmentId: string): Promise<void> {
    await this.db
      .deleteFrom('exercise_equipment')
      .where('exercise_id', '=', exerciseId)
      .where('equipment_id', '=', equipmentId)
      .execute();
  }
}
