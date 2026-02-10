import { CardioCategoriesTable } from './cardio-categories-table.interface';
import { CardioStepGroupItemsTable } from './cardio-step-group-items-table.interface';
import { CardioStepGroupsTable } from './cardio-step-groups-table.interface';
import { CardioStepsTable } from './cardio-steps-table.interface';
import { EquipmentTable } from './equipment-table.interface';
import { ExerciseEquipmentTable } from './exercise-equipment-table.interface';
import { ExerciseImagesTable } from './exercise-images-table.interface';
import { ExerciseInstanceGroupItemsTable } from './exercise-instance-group-items-table.interface';
import { ExerciseInstanceGroupsTable } from './exercise-instance-groups-table.interface';
import { ExerciseInstancesTable } from './exercise-instances-table.interface';
import { ExerciseMuscleGroupsTable } from './exercise-muscle-groups-table.interface';
import { ExercisesTable } from './exercises-table.interface';
import { MuscleGroupsTable } from './muscle-groups-table.interface';
import { RefreshTokensTable } from './refresh-tokens-table.interface';
import { UsersTable } from './users-table.interface';
import { WorkoutItemsTable } from './workout-items-table.interface';
import { WorkoutSchedulesTable } from './workout-schedules-table.interface';
import { WorkoutsTable } from './workouts-table.interface';

export interface Database {
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
  exercises: ExercisesTable;
  equipment: EquipmentTable;
  exercise_equipment: ExerciseEquipmentTable;
  muscle_groups: MuscleGroupsTable;
  exercise_muscle_groups: ExerciseMuscleGroupsTable;
  exercise_images: ExerciseImagesTable;
  exercise_instances: ExerciseInstancesTable;
  exercise_instance_groups: ExerciseInstanceGroupsTable;
  exercise_instance_group_items: ExerciseInstanceGroupItemsTable;
  workouts: WorkoutsTable;
  workout_items: WorkoutItemsTable;
  workout_schedules: WorkoutSchedulesTable;
  cardio_categories: CardioCategoriesTable;
  cardio_steps: CardioStepsTable;
  cardio_step_groups: CardioStepGroupsTable;
  cardio_step_group_items: CardioStepGroupItemsTable;
}
