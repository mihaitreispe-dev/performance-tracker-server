import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, InlineImage, NewInlineImage } from 'src/database/interfaces';

@Injectable()
export class InlineImageRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(data: NewInlineImage): Promise<InlineImage> {
    return this.db.insertInto('inline_images').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async findById(id: string): Promise<InlineImage | undefined> {
    return this.db.selectFrom('inline_images').selectAll().where('id', '=', id).executeTakeFirst();
  }
}
