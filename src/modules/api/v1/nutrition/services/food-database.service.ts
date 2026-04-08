import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, catchError, of, timeout } from 'rxjs';
import { FoodRepository } from 'src/repositories/food.repository';
import { Food, FoodSource, NewFood } from 'src/database/interfaces';
import { USDAFood, USDANutrient, OpenFoodFactsProduct } from '../types';

const USDA_API_URL = 'https://api.nal.usda.gov/fdc/v1';
const OFF_API_URL = 'https://world.openfoodfacts.org/api/v2';

// USDA Nutrient IDs
const NUTRIENT_IDS = {
  ENERGY: 1008, // kcal
  PROTEIN: 1003,
  CARBS: 1005,
  FAT: 1004,
  FIBER: 1079,
  SUGAR: 2000,
  SODIUM: 1093,
  POTASSIUM: 1092,
  CALCIUM: 1087,
  IRON: 1089,
  VITAMIN_A: 1106, // RAE
  VITAMIN_C: 1162,
  VITAMIN_D: 1114, // D2 + D3
  VITAMIN_B12: 1178,
  SATURATED_FAT: 1258,
  TRANS_FAT: 1257,
  CHOLESTEROL: 1253,
};

@Injectable()
export class FoodDatabaseService {
  private readonly logger = new Logger(FoodDatabaseService.name);
  private readonly usdaApiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly foodRepository: FoodRepository,
  ) {
    this.usdaApiKey = this.configService.get<string>('USDA_API_KEY') || '';
  }

  /**
   * Search for foods - checks local database first, then external APIs
   */
  async search(query: string, options: { source?: FoodSource; limit?: number } = {}): Promise<Food[]> {
    const { source, limit = 50 } = options;

    // First, search local database
    const localResults = await this.foodRepository.search({ query, source, limit });

    // If we have enough local results, return them
    if (localResults.length >= limit) {
      return localResults.slice(0, limit);
    }

    // If no specific source filter, try external APIs for additional results
    if (!source && localResults.length < 20) {
      const remaining = limit - localResults.length;

      try {
        // Search USDA API
        const usdaResults = await this.searchUSDA(query, Math.min(remaining, 25));
        const newFoods: Food[] = [];

        for (const usdaFood of usdaResults) {
          // Check if already in local DB
          const existing = await this.foodRepository.findByExternalId(String(usdaFood.fdcId));
          if (!existing) {
            const newFood = this.transformUSDAFood(usdaFood);
            const created = await this.foodRepository.create(newFood);
            newFoods.push(created);
          }
        }

        return [...localResults, ...newFoods].slice(0, limit);
      } catch (error) {
        this.logger.warn('Failed to fetch from USDA API', error);
      }
    }

    return localResults;
  }

  /**
   * Search USDA FoodData Central API
   */
  async searchUSDA(query: string, limit = 25): Promise<USDAFood[]> {
    if (!this.usdaApiKey) {
      this.logger.warn('USDA API key not configured');
      return [];
    }

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(`${USDA_API_URL}/foods/search?api_key=${this.usdaApiKey}`, {
            query,
            dataType: ['Foundation', 'SR Legacy', 'Branded'],
            pageSize: limit,
            sortBy: 'dataType.keyword',
            sortOrder: 'asc',
          })
          .pipe(
            timeout(10000),
            catchError((error) => {
              this.logger.error('USDA API error', error);
              return of({ data: { foods: [] } });
            }),
          ),
      );

      return response.data.foods || [];
    } catch (error) {
      this.logger.error('Failed to search USDA', error);
      return [];
    }
  }

  /**
   * Get food by barcode - checks local first, then Open Food Facts
   */
  async getByBarcode(barcode: string): Promise<Food | null> {
    // Check local database first
    const local = await this.foodRepository.findByBarcode(barcode);
    if (local) {
      return local;
    }

    // Try Open Food Facts API
    try {
      const product = await this.fetchOpenFoodFactsProduct(barcode);
      if (product && product.product_name) {
        const newFood = this.transformOpenFoodFactsProduct(product, barcode);
        return this.foodRepository.create(newFood);
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch barcode ${barcode} from Open Food Facts`, error);
    }

    return null;
  }

  /**
   * Fetch product from Open Food Facts API
   */
  async fetchOpenFoodFactsProduct(barcode: string): Promise<OpenFoodFactsProduct | null> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .get(`${OFF_API_URL}/product/${barcode}`, {
            params: {
              fields: 'code,product_name,brands,serving_size,nutriments',
            },
          })
          .pipe(
            timeout(10000),
            catchError((error) => {
              this.logger.error('Open Food Facts API error', error);
              return of({ data: { status: 0 } });
            }),
          ),
      );

      if (response.data.status === 1 && response.data.product) {
        return response.data.product;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to fetch from Open Food Facts', error);
      return null;
    }
  }

  /**
   * Transform USDA food to local schema
   */
  transformUSDAFood(usdaFood: USDAFood): NewFood {
    const getNutrient = (id: number): number | null => {
      const nutrient = usdaFood.foodNutrients?.find((n: USDANutrient) => n.nutrientId === id);
      return nutrient?.value ?? null;
    };

    return {
      external_id: String(usdaFood.fdcId),
      source: FoodSource.USDA,
      name: usdaFood.description,
      brand: usdaFood.brandOwner || null,
      serving_size_grams: usdaFood.servingSize || 100,
      serving_size_description: usdaFood.servingSizeUnit || null,
      calories: getNutrient(NUTRIENT_IDS.ENERGY),
      protein_g: getNutrient(NUTRIENT_IDS.PROTEIN),
      carbs_g: getNutrient(NUTRIENT_IDS.CARBS),
      fat_g: getNutrient(NUTRIENT_IDS.FAT),
      fiber_g: getNutrient(NUTRIENT_IDS.FIBER),
      sugar_g: getNutrient(NUTRIENT_IDS.SUGAR),
      sodium_mg: getNutrient(NUTRIENT_IDS.SODIUM),
      potassium_mg: getNutrient(NUTRIENT_IDS.POTASSIUM),
      calcium_mg: getNutrient(NUTRIENT_IDS.CALCIUM),
      iron_mg: getNutrient(NUTRIENT_IDS.IRON),
      vitamin_a_mcg: getNutrient(NUTRIENT_IDS.VITAMIN_A),
      vitamin_c_mg: getNutrient(NUTRIENT_IDS.VITAMIN_C),
      vitamin_d_mcg: getNutrient(NUTRIENT_IDS.VITAMIN_D),
      vitamin_b12_mcg: getNutrient(NUTRIENT_IDS.VITAMIN_B12),
      saturated_fat_g: getNutrient(NUTRIENT_IDS.SATURATED_FAT),
      trans_fat_g: getNutrient(NUTRIENT_IDS.TRANS_FAT),
      cholesterol_mg: getNutrient(NUTRIENT_IDS.CHOLESTEROL),
    };
  }

  /**
   * Transform Open Food Facts product to local schema
   */
  transformOpenFoodFactsProduct(product: OpenFoodFactsProduct, barcode: string): NewFood {
    const n = product.nutriments;

    return {
      external_id: product.code || barcode,
      source: FoodSource.OPEN_FOOD_FACTS,
      barcode: barcode,
      name: product.product_name,
      brand: product.brands || null,
      serving_size_grams: 100, // OFF data is per 100g
      serving_size_description: product.serving_size || null,
      calories: n?.energy_kcal_100g ?? null,
      protein_g: n?.proteins_100g ?? null,
      carbs_g: n?.carbohydrates_100g ?? null,
      fat_g: n?.fat_100g ?? null,
      fiber_g: n?.fiber_100g ?? null,
      sugar_g: n?.sugars_100g ?? null,
      sodium_mg: n?.sodium_100g ? n.sodium_100g * 1000 : null, // Convert g to mg
      potassium_mg: n?.potassium_100g ? n.potassium_100g * 1000 : null,
      calcium_mg: n?.calcium_100g ? n.calcium_100g * 1000 : null,
      iron_mg: n?.iron_100g ? n.iron_100g * 1000 : null,
      vitamin_a_mcg: n?.['vitamin-a_100g'] ? n['vitamin-a_100g'] * 1000000 : null,
      vitamin_c_mg: n?.['vitamin-c_100g'] ? n['vitamin-c_100g'] * 1000 : null,
      vitamin_d_mcg: n?.['vitamin-d_100g'] ? n['vitamin-d_100g'] * 1000000 : null,
      vitamin_b12_mcg: n?.['vitamin-b12_100g'] ? n['vitamin-b12_100g'] * 1000000 : null,
      saturated_fat_g: n?.['saturated-fat_100g'] ?? null,
      trans_fat_g: n?.['trans-fat_100g'] ?? null,
      cholesterol_mg: n?.cholesterol_100g ? n.cholesterol_100g * 1000 : null,
    };
  }
}
