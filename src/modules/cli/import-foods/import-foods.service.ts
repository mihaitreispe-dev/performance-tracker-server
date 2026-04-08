import { Injectable, Logger } from '@nestjs/common';
import { Command, Console } from 'nestjs-console';
import { FoodSource, NewFood } from 'src/database/interfaces';
import { FoodRepository } from 'src/repositories/food.repository';

import { OpenFoodFactsParser } from './open-food-facts-parser';
import { USDAParser } from './usda-parser';

interface ImportFoodsOptions {
  source: string;
  dryRun?: boolean;
  limit?: string;
  usdaFoodFile?: string;
  usdaNutrientFile?: string;
  offFile?: string;
  minCompleteness?: string;
  batchSize?: string;
  clearExisting?: boolean;
}

@Injectable()
@Console()
export class ImportFoodsService {
  private readonly logger = new Logger(ImportFoodsService.name);
  private readonly usdaParser = new USDAParser();
  private readonly offParser = new OpenFoodFactsParser();

  constructor(private readonly foodRepository: FoodRepository) {}

  @Command({
    command: 'import-foods <source>',
    description: 'Import foods from USDA or Open Food Facts database dumps',
    options: [
      {
        flags: '--dry-run',
        description: 'Preview what would be imported without making changes',
      },
      {
        flags: '--limit <value>',
        description: 'Limit the number of foods to import',
        defaultValue: '0',
      },
      {
        flags: '--usda-food-file <path>',
        description: 'Path to USDA food.csv file',
        defaultValue: './data/usda/food.csv',
      },
      {
        flags: '--usda-nutrient-file <path>',
        description: 'Path to USDA food_nutrient.csv file',
        defaultValue: './data/usda/food_nutrient.csv',
      },
      {
        flags: '--off-file <path>',
        description: 'Path to Open Food Facts CSV/TSV file (can be gzipped)',
        defaultValue: './data/off/en.openfoodfacts.org.products.csv.gz',
      },
      {
        flags: '--min-completeness <value>',
        description: 'Minimum completeness score for OFF products (0-1)',
        defaultValue: '0.5',
      },
      {
        flags: '--batch-size <value>',
        description: 'Number of foods to insert per batch',
        defaultValue: '1000',
      },
      {
        flags: '--clear-existing',
        description: 'Clear existing foods from the specified source before importing',
      },
    ],
  })
  async importFoods(source: string, opts: ImportFoodsOptions): Promise<void> {
    const normalizedSource = source.toLowerCase();

    if (!['usda', 'off', 'all'].includes(normalizedSource)) {
      this.logger.error(`Invalid source: ${source}. Use 'usda', 'off', or 'all'`);
      return;
    }

    this.logger.log('\n=== Food Database Import ===\n');

    if (opts.dryRun) {
      this.logger.log('DRY RUN MODE - No changes will be made\n');
    }

    const limit = Number.parseInt(opts.limit || '0', 10);
    const batchSize = Number.parseInt(opts.batchSize || '1000', 10);

    if (normalizedSource === 'usda' || normalizedSource === 'all') {
      await this.importUSDA(opts, limit, batchSize);
    }

    if (normalizedSource === 'off' || normalizedSource === 'all') {
      await this.importOpenFoodFacts(opts, limit, batchSize);
    }

    this.logger.log('\n=== Import Complete ===\n');
  }

  private async importUSDA(opts: ImportFoodsOptions, limit: number, batchSize: number): Promise<void> {
    this.logger.log('\n--- USDA FoodData Central ---\n');

    const foodFile = opts.usdaFoodFile || './data/usda/food.csv';
    const nutrientFile = opts.usdaNutrientFile || './data/usda/food_nutrient.csv';

    this.logger.log(`Food file: ${foodFile}`);
    this.logger.log(`Nutrient file: ${nutrientFile}`);

    try {
      // Check current count
      const existingCount = await this.foodRepository.countBySource(FoodSource.USDA);
      this.logger.log(`Existing USDA foods in database: ${existingCount}`);

      if (opts.clearExisting && existingCount > 0) {
        if (opts.dryRun) {
          this.logger.log(`Would delete ${existingCount} existing USDA foods`);
        } else {
          this.logger.log(`Clearing ${existingCount} existing USDA foods...`);
          await this.foodRepository.deleteBySource(FoodSource.USDA);
        }
      }

      // Parse files
      const foods = await this.usdaParser.parseUSDAFiles(foodFile, nutrientFile, {
        limit: limit || undefined,
        dataTypes: ['foundation_food', 'sr_legacy_food'],
      });

      if (opts.dryRun) {
        this.logger.log(`Would import ${foods.length} USDA foods`);
        this.logSampleFoods(foods.slice(0, 5));
        return;
      }

      // Import in batches
      await this.importInBatches(foods, batchSize, 'USDA');

      const finalCount = await this.foodRepository.countBySource(FoodSource.USDA);
      this.logger.log(`Total USDA foods in database: ${finalCount}`);
    } catch (error) {
      this.logger.error(`Failed to import USDA foods: ${error}`);
      if (error instanceof Error) {
        this.logger.error(`Stack: ${error.stack}`);
        if ('errors' in error) {
          for (const e of (error as AggregateError).errors) {
            this.logger.error(`  - ${e}`);
          }
        }
      }
    }
  }

  private async importOpenFoodFacts(opts: ImportFoodsOptions, limit: number, batchSize: number): Promise<void> {
    this.logger.log('\n--- Open Food Facts ---\n');

    const offFile = opts.offFile || './data/off/en.openfoodfacts.org.products.csv.gz';
    const minCompleteness = Number.parseFloat(opts.minCompleteness || '0.5');

    this.logger.log(`File: ${offFile}`);
    this.logger.log(`Min completeness: ${minCompleteness}`);

    try {
      // Check current count
      const existingCount = await this.foodRepository.countBySource(FoodSource.OPEN_FOOD_FACTS);
      this.logger.log(`Existing OFF foods in database: ${existingCount}`);

      if (opts.clearExisting && existingCount > 0) {
        if (opts.dryRun) {
          this.logger.log(`Would delete ${existingCount} existing OFF foods`);
        } else {
          this.logger.log(`Clearing ${existingCount} existing OFF foods...`);
          await this.foodRepository.deleteBySource(FoodSource.OPEN_FOOD_FACTS);
        }
      }

      // Parse file
      const foods = await this.offParser.parseOFFFile(offFile, {
        limit: limit || 100000,
        minCompleteness,
        countries: ['en:united-states', 'en:united-kingdom', 'en:australia', 'en:canada'],
      });

      if (opts.dryRun) {
        this.logger.log(`Would import ${foods.length} OFF foods`);
        this.logSampleFoods(foods.slice(0, 5));
        return;
      }

      // Import in batches
      await this.importInBatches(foods, batchSize, 'OFF');

      const finalCount = await this.foodRepository.countBySource(FoodSource.OPEN_FOOD_FACTS);
      this.logger.log(`Total OFF foods in database: ${finalCount}`);
    } catch (error) {
      this.logger.error(`Failed to import OFF foods: ${error}`);
    }
  }

  private async importInBatches(foods: NewFood[], batchSize: number, sourceName: string): Promise<void> {
    const totalBatches = Math.ceil(foods.length / batchSize);
    let imported = 0;
    let failed = 0;

    this.logger.log(`Importing ${foods.length} ${sourceName} foods in ${totalBatches} batches...`);

    for (let i = 0; i < foods.length; i += batchSize) {
      const batch = foods.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      try {
        const count = await this.foodRepository.createMany(batch);
        imported += count;
        this.logger.log(`Batch ${batchNum}/${totalBatches}: Imported ${count} foods`);
      } catch (_error) {
        // Try individual inserts to handle duplicates
        let batchImported = 0;
        for (const food of batch) {
          try {
            // Check if exists
            const existing = await this.foodRepository.findByExternalId(food.external_id!);
            if (!existing) {
              await this.foodRepository.create(food);
              batchImported++;
            }
          } catch {
            failed++;
          }
        }
        imported += batchImported;
        this.logger.log(`Batch ${batchNum}/${totalBatches}: Imported ${batchImported} foods (with retries)`);
      }
    }

    this.logger.log(`\n${sourceName} Import Summary:`);
    this.logger.log(`  Imported: ${imported}`);
    this.logger.log(`  Failed: ${failed}`);
  }

  private logSampleFoods(foods: NewFood[]): void {
    this.logger.log('\nSample foods:');
    for (const food of foods) {
      this.logger.log(`  - ${food.name}`);
      this.logger.log(
        `    Calories: ${food.calories}, Protein: ${food.protein_g}g, Carbs: ${food.carbs_g}g, Fat: ${food.fat_g}g`,
      );
    }
  }
}
