import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  DefaultLoadModelParameters,
  LoadModelParameters,
  LoadModelParameterValues,
  NewLoadModelParameters,
  ParameterSnapshot,
  PredictionError,
  UpdateLoadModelParameters,
} from 'src/database/interfaces';

@Injectable()
export class LoadModelParametersRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<LoadModelParameters | undefined> {
    return this.db.selectFrom('load_model_parameters').selectAll().where('id', '=', id).executeTakeFirst();
  }

  async findByUserId(userId: string): Promise<LoadModelParameters | undefined> {
    return this.db.selectFrom('load_model_parameters').selectAll().where('user_id', '=', userId).executeTakeFirst();
  }

  async findOrCreateDefault(userId: string): Promise<LoadModelParameters> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return existing;
    }

    return this.create({ user_id: userId });
  }

  async create(data: NewLoadModelParameters): Promise<LoadModelParameters> {
    return this.db.insertInto('load_model_parameters').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async update(id: string, data: UpdateLoadModelParameters): Promise<LoadModelParameters | undefined> {
    return this.db
      .updateTable('load_model_parameters')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async updateByUserId(userId: string, data: UpdateLoadModelParameters): Promise<LoadModelParameters | undefined> {
    return this.db
      .updateTable('load_model_parameters')
      .set({ ...data, updated_at: sql`now()` })
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirst();
  }

  async upsert(data: NewLoadModelParameters): Promise<LoadModelParameters> {
    return this.db
      .insertInto('load_model_parameters')
      .values(data)
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet({
          aerobic_ctl_decay: data.aerobic_ctl_decay,
          aerobic_atl_decay: data.aerobic_atl_decay,
          msk_ctl_decay: data.msk_ctl_decay,
          msk_atl_decay: data.msk_atl_decay,
          neural_ctl_decay: data.neural_ctl_decay,
          neural_atl_decay: data.neural_atl_decay,
          run_aerobic_coef: data.run_aerobic_coef,
          bike_aerobic_coef: data.bike_aerobic_coef,
          swim_aerobic_coef: data.swim_aerobic_coef,
          strength_aerobic_coef: data.strength_aerobic_coef,
          w_sleep: data.w_sleep,
          w_alcohol: data.w_alcohol,
          w_stress: data.w_stress,
          parameter_confidence: data.parameter_confidence,
          data_points_used: data.data_points_used,
          last_update_date: data.last_update_date,
          mae_7day: data.mae_7day,
          mae_30day: data.mae_30day,
          parameter_history: data.parameter_history,
          prediction_errors: data.prediction_errors,
          updated_at: sql`now()`,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('load_model_parameters').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async deleteByUserId(userId: string): Promise<boolean> {
    const result = await this.db.deleteFrom('load_model_parameters').where('user_id', '=', userId).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async appendPredictionError(userId: string, error: PredictionError): Promise<void> {
    const params = await this.findByUserId(userId);
    if (!params) return;

    const errors = [...(params.prediction_errors || []), error];
    // Keep only last 90 days
    const trimmedErrors = errors.slice(-90);

    await this.updateByUserId(userId, {
      prediction_errors: trimmedErrors,
      data_points_used: params.data_points_used + 1,
    });
  }

  async appendParameterSnapshot(userId: string, snapshot: ParameterSnapshot): Promise<void> {
    const params = await this.findByUserId(userId);
    if (!params) return;

    const history = [...(params.parameter_history || []), snapshot];
    // Keep only last 10 snapshots
    const trimmedHistory = history.slice(-10);

    await this.updateByUserId(userId, {
      parameter_history: trimmedHistory,
    });
  }

  async getParametersWithDefaults(userId: string): Promise<LoadModelParameterValues & { id?: string }> {
    const params = await this.findByUserId(userId);

    if (!params) {
      return { ...DefaultLoadModelParameters };
    }

    return {
      id: params.id,
      aerobic_ctl_decay: parseFloat(params.aerobic_ctl_decay) || DefaultLoadModelParameters.aerobic_ctl_decay,
      aerobic_atl_decay: parseFloat(params.aerobic_atl_decay) || DefaultLoadModelParameters.aerobic_atl_decay,
      msk_ctl_decay: parseFloat(params.msk_ctl_decay) || DefaultLoadModelParameters.msk_ctl_decay,
      msk_atl_decay: parseFloat(params.msk_atl_decay) || DefaultLoadModelParameters.msk_atl_decay,
      neural_ctl_decay: parseFloat(params.neural_ctl_decay) || DefaultLoadModelParameters.neural_ctl_decay,
      neural_atl_decay: parseFloat(params.neural_atl_decay) || DefaultLoadModelParameters.neural_atl_decay,
      run_aerobic_coef: parseFloat(params.run_aerobic_coef) || DefaultLoadModelParameters.run_aerobic_coef,
      bike_aerobic_coef: parseFloat(params.bike_aerobic_coef) || DefaultLoadModelParameters.bike_aerobic_coef,
      swim_aerobic_coef: parseFloat(params.swim_aerobic_coef) || DefaultLoadModelParameters.swim_aerobic_coef,
      strength_aerobic_coef:
        parseFloat(params.strength_aerobic_coef) || DefaultLoadModelParameters.strength_aerobic_coef,
      w_sleep: parseFloat(params.w_sleep) || DefaultLoadModelParameters.w_sleep,
      w_alcohol: parseFloat(params.w_alcohol) || DefaultLoadModelParameters.w_alcohol,
      w_stress: parseFloat(params.w_stress) || DefaultLoadModelParameters.w_stress,
      parameter_confidence:
        parseFloat(params.parameter_confidence) || DefaultLoadModelParameters.parameter_confidence,
      data_points_used: params.data_points_used || DefaultLoadModelParameters.data_points_used,
    };
  }

  async getAllUsersWithSufficientData(minDataPoints: number = 14): Promise<string[]> {
    const results = await this.db
      .selectFrom('load_model_parameters')
      .select('user_id')
      .where('data_points_used', '>=', minDataPoints)
      .execute();

    return results.map((r) => r.user_id);
  }
}
