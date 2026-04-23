import * as fs from 'node:fs';
import * as readline from 'node:readline';

import { Logger } from '@nestjs/common';
import { FoodSource, NewFood } from 'src/database/interfaces';

// USDA nutrient IDs
const NUTRIENT_IDS = {
  ENERGY: 1008, // Energy (kcal)
  PROTEIN: 1003, // Protein
  CARBS: 1005, // Carbohydrate, by difference
  FAT: 1004, // Total lipid (fat)
  FIBER: 1079, // Fiber, total dietary
  SUGAR: 2000, // Total Sugars
  SODIUM: 1093, // Sodium, Na
  POTASSIUM: 1092, // Potassium, K
  CALCIUM: 1087, // Calcium, Ca
  IRON: 1089, // Iron, Fe
  VITAMIN_A: 1106, // Vitamin A, RAE
  VITAMIN_C: 1162, // Vitamin C
  VITAMIN_D: 1114, // Vitamin D (D2 + D3)
  VITAMIN_B12: 1178, // Vitamin B-12
  SATURATED_FAT: 1258, // Fatty acids, total saturated
  TRANS_FAT: 1257, // Fatty acids, total trans
  CHOLESTEROL: 1253, // Cholesterol
};

interface USDAFoodRecord {
  fdc_id: string;
  data_type: string;
  description: string;
  brand_owner?: string;
}

interface USDANutrientRecord {
  fdc_id: string;
  nutrient_id: string;
  amount: string;
}

export class USDAParser {
  private readonly logger = new Logger(USDAParser.name);

  /**
   * Parse USDA FoodData Central CSV files
   * Expected files:
   * - food.csv: Main food records
   * - food_nutrient.csv: Nutrient values per food
   */
  async parseUSDAFiles(
    foodFilePath: string,
    nutrientFilePath: string,
    options: { limit?: number; dataTypes?: string[] } = {},
  ): Promise<NewFood[]> {
    const { limit = 0, dataTypes = ['foundation_food', 'sr_legacy_food'] } = options;

    this.logger.log('Loading USDA food data...');

    // Step 1: Load all foods into memory
    const foods = new Map<string, USDAFoodRecord>();
    await this.parseCSVFile(foodFilePath, (row) => {
      if (dataTypes.length === 0 || dataTypes.includes(row.data_type?.toLowerCase())) {
        foods.set(row.fdc_id, {
          fdc_id: row.fdc_id,
          data_type: row.data_type,
          description: row.description,
          brand_owner: row.brand_owner,
        });
      }
    });
    this.logger.log(`Loaded ${foods.size} food records`);

    // Step 2: Load nutrients and aggregate by food
    const nutrientsByFood = new Map<string, Map<number, number>>();
    await this.parseCSVFile(nutrientFilePath, (row) => {
      if (foods.has(row.fdc_id)) {
        if (!nutrientsByFood.has(row.fdc_id)) {
          nutrientsByFood.set(row.fdc_id, new Map());
        }
        const nutrientId = Number.parseInt(row.nutrient_id, 10);
        const amount = Number.parseFloat(row.amount);
        if (!isNaN(nutrientId) && !isNaN(amount)) {
          nutrientsByFood.get(row.fdc_id)!.set(nutrientId, amount);
        }
      }
    });
    this.logger.log(`Loaded nutrients for ${nutrientsByFood.size} foods`);

    // Step 3: Transform to NewFood records
    const result: NewFood[] = [];
    let count = 0;

    for (const [fdcId, food] of foods) {
      if (limit > 0 && count >= limit) break;

      const nutrients = nutrientsByFood.get(fdcId) || new Map();
      const newFood = this.transformToNewFood(food, nutrients);
      result.push(newFood);
      count++;
    }

    this.logger.log(`Parsed ${result.length} foods`);
    return result;
  }

  private transformToNewFood(food: USDAFoodRecord, nutrients: Map<number, number>): NewFood {
    return {
      external_id: food.fdc_id,
      source: FoodSource.USDA,
      name: this.cleanFoodName(food.description),
      brand: food.brand_owner || null,
      serving_size_grams: 100, // USDA data is per 100g
      serving_size_description: '100g',
      calories: nutrients.get(NUTRIENT_IDS.ENERGY) ?? null,
      protein_g: nutrients.get(NUTRIENT_IDS.PROTEIN) ?? null,
      carbs_g: nutrients.get(NUTRIENT_IDS.CARBS) ?? null,
      fat_g: nutrients.get(NUTRIENT_IDS.FAT) ?? null,
      fiber_g: nutrients.get(NUTRIENT_IDS.FIBER) ?? null,
      sugar_g: nutrients.get(NUTRIENT_IDS.SUGAR) ?? null,
      sodium_mg: nutrients.get(NUTRIENT_IDS.SODIUM) ?? null,
      potassium_mg: nutrients.get(NUTRIENT_IDS.POTASSIUM) ?? null,
      calcium_mg: nutrients.get(NUTRIENT_IDS.CALCIUM) ?? null,
      iron_mg: nutrients.get(NUTRIENT_IDS.IRON) ?? null,
      vitamin_a_mcg: nutrients.get(NUTRIENT_IDS.VITAMIN_A) ?? null,
      vitamin_c_mg: nutrients.get(NUTRIENT_IDS.VITAMIN_C) ?? null,
      vitamin_d_mcg: nutrients.get(NUTRIENT_IDS.VITAMIN_D) ?? null,
      vitamin_b12_mcg: nutrients.get(NUTRIENT_IDS.VITAMIN_B12) ?? null,
      saturated_fat_g: nutrients.get(NUTRIENT_IDS.SATURATED_FAT) ?? null,
      trans_fat_g: nutrients.get(NUTRIENT_IDS.TRANS_FAT) ?? null,
      cholesterol_mg: nutrients.get(NUTRIENT_IDS.CHOLESTEROL) ?? null,
    };
  }

  private cleanFoodName(name: string): string {
    // Clean up USDA naming conventions
    return name
      .replace(/,\s*NFS$/i, '') // Remove ", NFS" (Not Further Specified)
      .replace(/,\s*raw$/i, ', raw')
      .trim();
  }

  private async parseCSVFile(filePath: string, rowHandler: (row: Record<string, string>) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        reject(new Error(`File not found: ${filePath}`));
        return;
      }

      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let headers: string[] = [];
      let isFirstLine = true;
      let lineCount = 0;

      rl.on('line', (line) => {
        if (isFirstLine) {
          headers = this.parseCSVLine(line);
          isFirstLine = false;
          return;
        }

        const values = this.parseCSVLine(line);
        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });
        rowHandler(row);
        lineCount++;

        if (lineCount % 100000 === 0) {
          this.logger.debug(`Processed ${lineCount} lines...`);
        }
      });

      rl.on('close', () => {
        this.logger.debug(`Finished parsing ${lineCount} lines`);
        resolve();
      });

      rl.on('error', (err) => {
        reject(err);
      });
    });
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }
}
