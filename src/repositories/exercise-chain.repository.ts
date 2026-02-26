import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, ExerciseChain, NewExerciseChainMember } from 'src/database/interfaces';

export interface ExerciseChainMemberWithExercise {
  chain_id: string;
  exercise_id: string;
  position: number;
  exercise_name: string;
  exercise_level: string | null;
}

@Injectable()
export class ExerciseChainRepository {
  constructor(@InjectKysely() protected readonly db: Kysely<Database>) {}

  async findByExerciseId(exerciseId: string): Promise<ExerciseChain | undefined> {
    const member = await this.db
      .selectFrom('exercise_chain_members')
      .where('exercise_id', '=', exerciseId)
      .selectAll()
      .executeTakeFirst();

    if (!member) {
      return undefined;
    }

    return this.db.selectFrom('exercise_chains').where('id', '=', member.chain_id).selectAll().executeTakeFirst();
  }

  async findChainMembers(chainId: string): Promise<ExerciseChainMemberWithExercise[]> {
    const results = await this.db
      .selectFrom('exercise_chain_members')
      .innerJoin('exercises', 'exercises.id', 'exercise_chain_members.exercise_id')
      .where('exercise_chain_members.chain_id', '=', chainId)
      .select([
        'exercise_chain_members.chain_id',
        'exercise_chain_members.exercise_id',
        'exercise_chain_members.position',
        'exercises.name',
        'exercises.level',
      ])
      .orderBy('exercise_chain_members.position', 'asc')
      .execute();

    return results.map((r) => ({
      chain_id: r.chain_id,
      exercise_id: r.exercise_id,
      position: r.position,
      exercise_name: r.name,
      exercise_level: r.level,
    }));
  }

  async findChainMembersByExerciseId(exerciseId: string): Promise<ExerciseChainMemberWithExercise[] | undefined> {
    const chain = await this.findByExerciseId(exerciseId);
    if (!chain) {
      return undefined;
    }
    return this.findChainMembers(chain.id);
  }

  async createChain(): Promise<ExerciseChain> {
    return this.db.insertInto('exercise_chains').values({}).returningAll().executeTakeFirstOrThrow();
  }

  async setChainMembers(chainId: string, exerciseIds: string[]): Promise<void> {
    // Delete all existing members
    await this.db.deleteFrom('exercise_chain_members').where('chain_id', '=', chainId).execute();

    if (exerciseIds.length === 0) {
      return;
    }

    // Insert new members with positions
    const members: NewExerciseChainMember[] = exerciseIds.map((exerciseId, index) => ({
      chain_id: chainId,
      exercise_id: exerciseId,
      position: index,
    }));

    await this.db.insertInto('exercise_chain_members').values(members).execute();

    // Update the chain's updated_at timestamp
    await this.db
      .updateTable('exercise_chains')
      .set({ updated_at: sql`now()` })
      .where('id', '=', chainId)
      .execute();
  }

  async removeExerciseFromChain(exerciseId: string): Promise<string | undefined> {
    const member = await this.db
      .selectFrom('exercise_chain_members')
      .where('exercise_id', '=', exerciseId)
      .select('chain_id')
      .executeTakeFirst();

    if (!member) {
      return undefined;
    }

    await this.db.deleteFrom('exercise_chain_members').where('exercise_id', '=', exerciseId).execute();

    // Re-order remaining members to fill the gap
    const remainingMembers = await this.db
      .selectFrom('exercise_chain_members')
      .where('chain_id', '=', member.chain_id)
      .orderBy('position', 'asc')
      .select(['exercise_id', 'position'])
      .execute();

    for (let i = 0; i < remainingMembers.length; i++) {
      if (remainingMembers[i].position !== i) {
        await this.db
          .updateTable('exercise_chain_members')
          .set({ position: i })
          .where('chain_id', '=', member.chain_id)
          .where('exercise_id', '=', remainingMembers[i].exercise_id)
          .execute();
      }
    }

    return member.chain_id;
  }

  async deleteChainIfEmpty(chainId: string): Promise<boolean> {
    const count = await this.db
      .selectFrom('exercise_chain_members')
      .where('chain_id', '=', chainId)
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();

    if (Number(count.count) === 0) {
      await this.db.deleteFrom('exercise_chains').where('id', '=', chainId).execute();
      return true;
    }

    return false;
  }

  async deleteById(chainId: string): Promise<void> {
    // Members will be deleted via CASCADE
    await this.db.deleteFrom('exercise_chains').where('id', '=', chainId).execute();
  }
}
