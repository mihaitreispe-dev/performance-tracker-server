import { EquipmentTable } from './equipment-table.interface';
import { ExerciseEquipmentTable } from './exercise-equipment-table.interface';
import { ExerciseImagesTable } from './exercise-images-table.interface';
import { ExerciseMuscleGroupsTable } from './exercise-muscle-groups-table.interface';
import { ExercisesTable } from './exercises-table.interface';
import { MuscleGroupsTable } from './muscle-groups-table.interface';
import { RefreshTokensTable } from './refresh-tokens-table.interface';
import { UsersTable } from './users-table.interface';

export interface Database {
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
  exercises: ExercisesTable;
  equipment: EquipmentTable;
  exercise_equipment: ExerciseEquipmentTable;
  muscle_groups: MuscleGroupsTable;
  exercise_muscle_groups: ExerciseMuscleGroupsTable;
  exercise_images: ExerciseImagesTable;
}
