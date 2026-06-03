import { AthleteIntakeTable } from './athlete-intake-table.interface';
import { AthletePrivacySettingsTable } from './athlete-privacy-settings-table.interface';
import { AthleteProfileMetricsTable } from './athlete-profile-metrics-table.interface';
import { AthleteRacesTable } from './athlete-races-table.interface';
import { CardioCategoriesTable } from './cardio-categories-table.interface';
import { CardioMetricsTable } from './cardio-metrics-table.interface';
import { CardioStepGroupItemsTable } from './cardio-step-group-items-table.interface';
import { CardioStepGroupsTable } from './cardio-step-groups-table.interface';
import { CardioStepsTable } from './cardio-steps-table.interface';
import { CoachAssignedWorkoutsTable } from './coach-assigned-workouts-table.interface';
import { CoachAthleteLabelsTable } from './coach-athlete-labels-table.interface';
import { CoachAthleteRelationshipsTable } from './coach-athlete-relationships-table.interface';
import { CoachScheduledPromptsTable } from './coach-scheduled-prompts-table.interface';
import { CoachingMessagesTable } from './coaching-messages-table.interface';
import { DailyHealthMetricsTable } from './daily-health-metrics-table.interface';
import { DailyNutritionSummariesTable } from './daily-nutrition-summaries-table.interface';
import { DailyTrainingLoadsTable } from './daily-training-loads-table.interface';
import { DataExportJobsTable } from './data-export-jobs-table.interface';
import { DataImportJobsTable } from './data-import-jobs-table.interface';
import { EquipmentTable } from './equipment-table.interface';
import { ExecutionWeatherTable } from './execution-weather-table.interface';
import { ExerciseChainMembersTable, ExerciseChainsTable } from './exercise-chains-table.interface';
import { ExerciseEquipmentTable } from './exercise-equipment-table.interface';
import { ExerciseImagesTable } from './exercise-images-table.interface';
import { ExerciseInstanceGroupItemsTable } from './exercise-instance-group-items-table.interface';
import { ExerciseInstanceGroupsTable } from './exercise-instance-groups-table.interface';
import { ExerciseInstancesTable } from './exercise-instances-table.interface';
import { ExerciseMuscleGroupsTable } from './exercise-muscle-groups-table.interface';
import { ExercisesTable } from './exercises-table.interface';
import { FitnessFatigueDailyTable } from './fitness-fatigue-daily-table.interface';
import { FitnessMetricsTable } from './fitness-metrics-table.interface';
import { FoodLogEntriesTable } from './food-log-entries-table.interface';
import { FoodsTable } from './foods-table.interface';
import { HistoricalRaceResultsTable } from './historical-race-results-table.interface';
import { HrvBaselineDailyTable } from './hrv-baseline-daily-table.interface';
import { IllnessLogsTable } from './illness-logs-table.interface';
import { LoadModelParametersTable } from './load-model-parameters-table.interface';
import { ContentItemsTable } from './content-items-table.interface';
import { InlineImagesTable } from './inline-images-table.interface';
import { MembershipAuditLogTable } from './membership-audit-log-table.interface';
import {
  CourseCompletionsTable,
  CourseLessonsTable,
  CoursesTable,
} from './courses-table.interface';
import {
  AthleteModuleOverridesTable,
  ModulesTable,
  OrganisationClientTypeModuleDefaultsTable,
  OrganisationModuleSettingsTable,
} from './modules-table.interface';
import { MultiStreamLoadDailyTable } from './multi-stream-load-daily-table.interface';
import { MuscleGroupsTable } from './muscle-groups-table.interface';
import { NotificationsTable } from './notifications-table.interface';
import { OAuthAuthorizationCodesTable } from './oauth-authorization-codes-table.interface';
import { OAuthStatesTable } from './oauth-states-table.interface';
import { OnboardingQuestionnairesTable } from './onboarding-questionnaires-table.interface';
import { OnboardingResponsesTable } from './onboarding-responses-table.interface';
import { OrganisationApiKeysTable } from './organisation-api-keys-table.interface';
import {
  OrganisationApiUsageDailyTable,
  OrganisationApiUsageTable,
} from './organisation-api-usage-table.interface';
import { OrganisationMembershipsTable } from './organisation-memberships-table.interface';
import { OrganisationThemesTable } from './organisation-themes-table.interface';
import { OrganisationsTable } from './organisations-table.interface';
import {
  OrganisationStripeAccountsTable,
  StripeCouponsTable,
  StripeCustomersTable,
  StripePricesTable,
  StripeProductsTable,
  StripeSubscriptionsTable,
  StripeWebhookEventsTable,
} from './stripe-billing-tables.interface';
import { PainLogsTable } from './pain-logs-table.interface';
import { PeriodizationPlansTable } from './periodization-plans-table.interface';
import { PersonalRecordHistoryTable } from './personal-record-history-table.interface';
import { PersonalRecordsTable } from './personal-records-table.interface';
import { QuestionnaireInstancesTable } from './questionnaire-instances-table.interface';
import { QuestionnaireQuestionsTable } from './questionnaire-questions-table.interface';
import { QuestionnaireResponsesTable } from './questionnaire-responses-table.interface';
import { QuestionnaireTemplatesTable } from './questionnaire-templates-table.interface';
import { QuickWellnessCheckinsTable } from './quick-wellness-checkins-table.interface';
import { RaceEventsTable } from './race-events-table.interface';
import { RacePlansTable } from './race-plans-table.interface';
import { RacePredictionsTable } from './race-predictions-table.interface';
import { RecoveryJournalEntriesTable } from './recovery-journal-entries-table.interface';
import { RefreshTokensTable } from './refresh-tokens-table.interface';
import { ResourceEntitlementsTable } from './resource-entitlements-table.interface';
import { RouteMarkersTable } from './route-markers-table.interface';
import { RpeTssTrackingTable } from './rpe-tss-tracking-table.interface';
import { SetCompletionsTable } from './set-completions-table.interface';
import { SleepBaselinesTable } from './sleep-baselines-table.interface';
import { SleepLogsTable } from './sleep-logs-table.interface';
import { TrainingStressScoresTable } from './training-stress-scores-table.interface';
import { UserFrequentFoodsTable } from './user-frequent-foods-table.interface';
import { UserIntegrationsTable } from './user-integrations-table.interface';
import { UserNutritionGoalsTable } from './user-nutrition-goals-table.interface';
import { UserSettingsTable } from './user-settings-table.interface';
import { UsersTable } from './users-table.interface';
import { WearableProviderConnectionsTable } from './wearable-provider-connections-table.interface';
import { WearableProviderPrioritiesTable } from './wearable-provider-priorities-table.interface';
import { WeatherForecastsTable } from './weather-forecasts-table.interface';
import { OutboundSyncJobsTable } from './outbound-sync-jobs-table.interface';
import { PlayerQoeEventsTable } from './player-qoe-events-table.interface';
import { WorkoutExecutionsTable } from './workout-executions-table.interface';
import { WorkoutFileImportsTable } from './workout-file-imports-table.interface';
import { WorkoutItemsTable } from './workout-items-table.interface';
import { WorkoutPlanItemsTable } from './workout-plan-items-table.interface';
import { WorkoutPlansTable } from './workout-plans-table.interface';
import { WorkoutRoutesTable } from './workout-routes-table.interface';
import { WorkoutSchedulesTable } from './workout-schedules-table.interface';
import { WorkoutsTable } from './workouts-table.interface';
import {
  NotificationRuleDeliveriesTable,
  NotificationRulesTable,
} from './notification-rules-table.interface';

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
  workout_executions: WorkoutExecutionsTable;
  player_qoe_events: PlayerQoeEventsTable;
  outbound_sync_jobs: OutboundSyncJobsTable;
  set_completions: SetCompletionsTable;
  cardio_categories: CardioCategoriesTable;
  cardio_metrics: CardioMetricsTable;
  cardio_steps: CardioStepsTable;
  cardio_step_groups: CardioStepGroupsTable;
  cardio_step_group_items: CardioStepGroupItemsTable;
  workout_routes: WorkoutRoutesTable;
  route_markers: RouteMarkersTable;
  user_integrations: UserIntegrationsTable;
  user_settings: UserSettingsTable;
  workout_file_imports: WorkoutFileImportsTable;
  workout_plans: WorkoutPlansTable;
  workout_plan_items: WorkoutPlanItemsTable;
  daily_training_loads: DailyTrainingLoadsTable;
  personal_records: PersonalRecordsTable;
  personal_record_history: PersonalRecordHistoryTable;
  execution_weather: ExecutionWeatherTable;
  sleep_logs: SleepLogsTable;
  oauth_states: OAuthStatesTable;
  fitness_metrics: FitnessMetricsTable;
  training_stress_scores: TrainingStressScoresTable;
  fitness_fatigue_daily: FitnessFatigueDailyTable;
  exercise_chains: ExerciseChainsTable;
  exercise_chain_members: ExerciseChainMembersTable;
  pain_logs: PainLogsTable;
  wearable_provider_connections: WearableProviderConnectionsTable;
  wearable_provider_priorities: WearableProviderPrioritiesTable;
  daily_health_metrics: DailyHealthMetricsTable;
  data_import_jobs: DataImportJobsTable;
  data_export_jobs: DataExportJobsTable;
  coach_athlete_relationships: CoachAthleteRelationshipsTable;
  athlete_privacy_settings: AthletePrivacySettingsTable;
  athlete_intake: AthleteIntakeTable;
  coach_assigned_workouts: CoachAssignedWorkoutsTable;
  coach_athlete_labels: CoachAthleteLabelsTable;
  coaching_messages: CoachingMessagesTable;
  notifications: NotificationsTable;
  coach_scheduled_prompts: CoachScheduledPromptsTable;

  // Multi-stream load modeling
  multi_stream_load_daily: MultiStreamLoadDailyTable;
  recovery_journal_entries: RecoveryJournalEntriesTable;
  hrv_baseline_daily: HrvBaselineDailyTable;
  load_model_parameters: LoadModelParametersTable;
  rpe_tss_tracking: RpeTssTrackingTable;
  quick_wellness_checkins: QuickWellnessCheckinsTable;
  illness_logs: IllnessLogsTable;

  // Race Calendar
  race_events: RaceEventsTable;
  athlete_races: AthleteRacesTable;
  periodization_plans: PeriodizationPlansTable;

  // Race Predictions
  athlete_profile_metrics: AthleteProfileMetricsTable;
  race_predictions: RacePredictionsTable;
  historical_race_results: HistoricalRaceResultsTable;
  race_plans: RacePlansTable;
  weather_forecasts: WeatherForecastsTable;

  // Sleep baselines for enhanced sleep scoring
  sleep_baselines: SleepBaselinesTable;

  // Nutrition tracking
  foods: FoodsTable;
  food_log_entries: FoodLogEntriesTable;
  daily_nutrition_summaries: DailyNutritionSummariesTable;
  user_nutrition_goals: UserNutritionGoalsTable;
  user_frequent_foods: UserFrequentFoodsTable;

  // Questionnaires
  questionnaire_templates: QuestionnaireTemplatesTable;
  questionnaire_questions: QuestionnaireQuestionsTable;
  questionnaire_instances: QuestionnaireInstancesTable;
  questionnaire_responses: QuestionnaireResponsesTable;

  // Organisations / multi-tenancy
  organisations: OrganisationsTable;
  organisation_memberships: OrganisationMembershipsTable;
  organisation_themes: OrganisationThemesTable;
  organisation_api_keys: OrganisationApiKeysTable;
  organisation_api_usage: OrganisationApiUsageTable;
  organisation_api_usage_daily: OrganisationApiUsageDailyTable;

  // Phase 3 — onboarding questionnaires + responses
  onboarding_questionnaires: OnboardingQuestionnairesTable;
  onboarding_responses: OnboardingResponsesTable;

  // Phase 4 — OAuth code grant for hosted client auth
  oauth_authorization_codes: OAuthAuthorizationCodesTable;

  // Phase 9 — Stripe Connect Express + subscriptions
  organisation_stripe_accounts: OrganisationStripeAccountsTable;
  stripe_customers: StripeCustomersTable;
  stripe_products: StripeProductsTable;
  stripe_prices: StripePricesTable;
  stripe_subscriptions: StripeSubscriptionsTable;
  stripe_coupons: StripeCouponsTable;
  stripe_webhook_events: StripeWebhookEventsTable;

  // Phase 11 — Resource gating: which products unlock which workouts/snacks/courses
  resource_entitlements: ResourceEntitlementsTable;

  // Modules registry
  modules: ModulesTable;
  organisation_module_settings: OrganisationModuleSettingsTable;
  athlete_module_overrides: AthleteModuleOverridesTable;
  organisation_client_type_module_defaults: OrganisationClientTypeModuleDefaultsTable;

  // Content layer (snacks, courses, exercise intros)
  content_items: ContentItemsTable;
  // Inline images embedded in rich-text descriptions.
  inline_images: InlineImagesTable;
  // Append-only log of membership mutations for ops forensics.
  membership_audit_log: MembershipAuditLogTable;
  courses: CoursesTable;
  course_lessons: CourseLessonsTable;
  course_completions: CourseCompletionsTable;

  // Phase 11 — Push notification rules + delivery log
  notification_rules: NotificationRulesTable;
  notification_rule_deliveries: NotificationRuleDeliveriesTable;
}
