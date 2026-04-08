import { Logger } from '@nestjs/common';
import { NewFood, FoodSource } from 'src/database/interfaces';
import * as fs from 'fs';
import * as readline from 'readline';
import * as zlib from 'zlib';

interface OFFProduct {
  code: string;
  product_name: string;
  brands?: string;
  serving_size?: string;
  completeness?: number;
  countries_tags?: string;
  // Nutrients
  energy_kcal_100g?: string;
  proteins_100g?: string;
  carbohydrates_100g?: string;
  fat_100g?: string;
  fiber_100g?: string;
  sugars_100g?: string;
  sodium_100g?: string;
  potassium_100g?: string;
  calcium_100g?: string;
  iron_100g?: string;
  'vitamin-a_100g'?: string;
  'vitamin-c_100g'?: string;
  'vitamin-d_100g'?: string;
  'vitamin-b12_100g'?: string;
  'saturated-fat_100g'?: string;
  'trans-fat_100g'?: string;
  cholesterol_100g?: string;
}

export class OpenFoodFactsParser {
  private readonly logger = new Logger(OpenFoodFactsParser.name);

  /**
   * Parse Open Food Facts CSV/TSV dump file
   * Download from: https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz
   */
  async parseOFFFile(
    filePath: string,
    options: {
      limit?: number;
      minCompleteness?: number;
      countries?: string[];
    } = {},
  ): Promise<NewFood[]> {
    const { limit = 100000, minCompleteness = 0.5, countries = ['en:united-states', 'en:united-kingdom'] } = options;

    this.logger.log('Loading Open Food Facts data...');
    this.logger.log(`Filters: limit=${limit}, minCompleteness=${minCompleteness}`);

    const result: NewFood[] = [];
    let processed = 0;
    let skipped = 0;

    await this.parseFile(filePath, (product) => {
      if (result.length >= limit) return;

      // Filter by completeness
      const completeness = parseFloat(String(product.completeness ?? '0'));
      if (completeness < minCompleteness) {
        skipped++;
        return;
      }

      // Filter by country
      if (countries.length > 0 && product.countries_tags) {
        const productCountries = product.countries_tags.split(',');
        const hasCountry = countries.some((c) => productCountries.includes(c));
        if (!hasCountry) {
          skipped++;
          return;
        }
      }

      // Must have name and calories
      if (!product.product_name || !product.energy_kcal_100g) {
        skipped++;
        return;
      }

      const newFood = this.transformToNewFood(product);
      if (newFood) {
        result.push(newFood);
      }

      processed++;
      if (processed % 10000 === 0) {
        this.logger.log(`Processed ${processed} valid products, skipped ${skipped}...`);
      }
    });

    this.logger.log(`Parsed ${result.length} foods (skipped ${skipped})`);
    return result;
  }

  private transformToNewFood(product: OFFProduct): NewFood | null {
    const calories = this.parseNumber(product.energy_kcal_100g);
    if (calories === null || calories === 0) return null;

    return {
      external_id: product.code,
      source: FoodSource.OPEN_FOOD_FACTS,
      barcode: product.code,
      name: this.cleanProductName(product.product_name),
      brand: product.brands?.split(',')[0]?.trim() || null,
      serving_size_grams: 100, // OFF data is per 100g
      serving_size_description: product.serving_size || '100g',
      calories,
      protein_g: this.parseNumber(product.proteins_100g),
      carbs_g: this.parseNumber(product.carbohydrates_100g),
      fat_g: this.parseNumber(product.fat_100g),
      fiber_g: this.parseNumber(product.fiber_100g),
      sugar_g: this.parseNumber(product.sugars_100g),
      sodium_mg: this.parseNumberMg(product.sodium_100g),
      potassium_mg: this.parseNumberMg(product.potassium_100g),
      calcium_mg: this.parseNumberMg(product.calcium_100g),
      iron_mg: this.parseNumberMg(product.iron_100g),
      vitamin_a_mcg: this.parseNumberMcg(product['vitamin-a_100g']),
      vitamin_c_mg: this.parseNumberMg(product['vitamin-c_100g']),
      vitamin_d_mcg: this.parseNumberMcg(product['vitamin-d_100g']),
      vitamin_b12_mcg: this.parseNumberMcg(product['vitamin-b12_100g']),
      saturated_fat_g: this.parseNumber(product['saturated-fat_100g']),
      trans_fat_g: this.parseNumber(product['trans-fat_100g']),
      cholesterol_mg: this.parseNumberMg(product.cholesterol_100g),
    };
  }

  private cleanProductName(name: string): string {
    return name
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500); // Limit length
  }

  private parseNumber(value: string | undefined): number | null {
    if (!value) return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }

  private parseNumberMg(value: string | undefined): number | null {
    // OFF stores some values in grams, convert to mg
    const num = this.parseNumber(value);
    if (num === null) return null;
    // If value seems too small (< 1), it's probably in grams
    return num < 1 ? num * 1000 : num;
  }

  private parseNumberMcg(value: string | undefined): number | null {
    // OFF stores some values in grams or mg, convert to mcg
    const num = this.parseNumber(value);
    if (num === null) return null;
    // If value seems too small (< 0.001), it's probably in grams
    if (num < 0.001) return num * 1000000;
    if (num < 1) return num * 1000;
    return num;
  }

  private async parseFile(
    filePath: string,
    rowHandler: (row: OFFProduct) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        reject(new Error(`File not found: ${filePath}`));
        return;
      }

      let fileStream: NodeJS.ReadableStream = fs.createReadStream(filePath);

      // Handle gzipped files
      if (filePath.endsWith('.gz')) {
        fileStream = fileStream.pipe(zlib.createGunzip());
      }

      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let headers: string[] = [];
      let isFirstLine = true;
      let lineCount = 0;

      rl.on('line', (line) => {
        if (isFirstLine) {
          // OFF uses tab-separated values
          headers = line.split('\t').map((h) => h.trim());
          isFirstLine = false;
          return;
        }

        const values = line.split('\t');
        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });
        rowHandler(row as unknown as OFFProduct);
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
}
