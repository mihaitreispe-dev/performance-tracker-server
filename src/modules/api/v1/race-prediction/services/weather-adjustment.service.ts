import { Injectable, Logger } from '@nestjs/common';
import { HeatStressLevel, WeatherAdjustments } from 'src/database/interfaces';

@Injectable()
export class WeatherAdjustmentService {
  private readonly logger = new Logger(WeatherAdjustmentService.name);

  // Optimal temperature range for endurance performance (°C)
  private readonly OPTIMAL_TEMP_MIN = 10;
  private readonly OPTIMAL_TEMP_MAX = 15;

  /**
   * Calculate total performance impact from weather conditions
   * Based on Ely et al. (2007) temperature model and other research
   */
  calculateWeatherImpact(
    predictedTimeSeconds: number,
    distanceMeters: number,
    temperature: number,
    humidity: number,
    windSpeedKmh: number,
    courseDirection?: number,
    windDirection?: number,
  ): WeatherAdjustments {
    const temperatureImpact = this.calculateTemperatureImpact(predictedTimeSeconds, distanceMeters, temperature);
    const humidityImpact = this.calculateHumidityImpact(predictedTimeSeconds, temperature, humidity);
    const windImpact = this.calculateWindImpact(
      predictedTimeSeconds,
      distanceMeters,
      windSpeedKmh,
      courseDirection,
      windDirection,
    );

    const totalImpactSeconds = temperatureImpact + humidityImpact + windImpact;
    const totalImpactPercent = (totalImpactSeconds / predictedTimeSeconds) * 100;

    const heatStressLevel = this.assessHeatStress(temperature, humidity);
    const hydrationMultiplier = this.calculateHydrationMultiplier(temperature, humidity, distanceMeters);
    const pacingAdvice = this.generatePacingAdvice(temperature, humidity, heatStressLevel, totalImpactPercent);
    const riskWarnings = this.generateRiskWarnings(temperature, humidity, windSpeedKmh, heatStressLevel);

    return {
      temperature_impact_seconds: Math.round(temperatureImpact),
      humidity_impact_seconds: Math.round(humidityImpact),
      wind_impact_seconds: Math.round(windImpact),
      total_impact_seconds: Math.round(totalImpactSeconds),
      total_impact_percent: parseFloat(totalImpactPercent.toFixed(2)),
      heat_stress_level: heatStressLevel,
      hydration_multiplier: parseFloat(hydrationMultiplier.toFixed(2)),
      pacing_advice: pacingAdvice,
      risk_warnings: riskWarnings.length > 0 ? riskWarnings : undefined,
    };
  }

  /**
   * Calculate temperature impact using Ely et al. (2007) model
   * ~1-2% slower per 5°C above optimal
   * Impact scales with distance (marathon more affected than 5K)
   */
  private calculateTemperatureImpact(predictedTimeSeconds: number, distanceMeters: number, temperature: number): number {
    const optimalMidpoint = (this.OPTIMAL_TEMP_MIN + this.OPTIMAL_TEMP_MAX) / 2;
    const tempDeviation = temperature - optimalMidpoint;

    if (tempDeviation <= 0) {
      // Below optimal: linear impact (less severe)
      return predictedTimeSeconds * 0.002 * Math.abs(tempDeviation);
    } else {
      // Above optimal: exponential impact (more severe as temp increases)
      // Base impact: 1.5% per 5°C
      const baseImpact = (tempDeviation / 5) * 0.015;

      // Exponential scaling for extreme heat
      const heatFactor = tempDeviation > 15 ? 1 + (tempDeviation - 15) / 50 : 1;

      // Distance scaling (longer races more affected)
      const distanceKm = distanceMeters / 1000;
      const distanceFactor = distanceKm > 21 ? 1.2 : distanceKm > 10 ? 1.1 : 1.0;

      return predictedTimeSeconds * baseImpact * heatFactor * distanceFactor;
    }
  }

  /**
   * Calculate humidity impact (Cheuvront & Haymes 2001)
   * Only significant above 18°C with high humidity
   */
  private calculateHumidityImpact(predictedTimeSeconds: number, temperature: number, humidity: number): number {
    if (temperature < 18) {
      return 0; // Humidity doesn't matter much in cooler temps
    }

    // Combined heat stress from temp + humidity
    const heatIndex = this.calculateHeatIndex(temperature, humidity);
    const heatIndexDeviation = heatIndex - temperature;

    if (heatIndexDeviation > 5) {
      // High humidity adding significant heat stress
      return predictedTimeSeconds * 0.01 * (heatIndexDeviation / 5);
    }

    return 0;
  }

  /**
   * Calculate wind impact (Davies 1980 drag model)
   * Headwind: ~1% per 10 km/h
   * Tailwind: ~0.5% benefit per 10 km/h (less benefit than headwind penalty)
   */
  private calculateWindImpact(
    predictedTimeSeconds: number,
    distanceMeters: number,
    windSpeedKmh: number,
    courseDirection?: number,
    windDirection?: number,
  ): number {
    // If course direction not available, assume average impact
    if (courseDirection === undefined || windDirection === undefined) {
      // Assume 50% of wind is effective (random course)
      const effectiveWind = windSpeedKmh * 0.5;
      return predictedTimeSeconds * 0.001 * effectiveWind;
    }

    // Calculate headwind/tailwind component
    const angleDiff = Math.abs(((courseDirection - windDirection + 180) % 360) - 180);
    const windComponent = windSpeedKmh * Math.cos((angleDiff * Math.PI) / 180);

    if (windComponent > 0) {
      // Headwind
      return predictedTimeSeconds * 0.001 * windComponent;
    } else {
      // Tailwind (less benefit)
      return predictedTimeSeconds * 0.0005 * windComponent;
    }
  }

  /**
   * Calculate heat index (feels-like temperature)
   */
  private calculateHeatIndex(temperature: number, humidity: number): number {
    if (temperature < 27) {
      return temperature; // Heat index formula not applicable
    }

    const T = temperature;
    const RH = humidity;

    const HI =
      -8.784695 +
      1.61139411 * T +
      2.338549 * RH +
      -0.14611605 * T * RH +
      -0.012308094 * T * T +
      -0.016424828 * RH * RH +
      0.002211732 * T * T * RH +
      0.00072546 * T * RH * RH +
      -0.000003582 * T * T * RH * RH;

    return HI;
  }

  /**
   * Assess heat stress level
   */
  private assessHeatStress(temperature: number, humidity: number): HeatStressLevel {
    const heatIndex = this.calculateHeatIndex(temperature, humidity);

    if (heatIndex < 27) {
      return HeatStressLevel.NONE;
    } else if (heatIndex < 32) {
      return HeatStressLevel.LOW;
    } else if (heatIndex < 39) {
      return HeatStressLevel.MODERATE;
    } else if (heatIndex < 46) {
      return HeatStressLevel.HIGH;
    } else {
      return HeatStressLevel.EXTREME;
    }
  }

  /**
   * Calculate hydration needs multiplier
   */
  private calculateHydrationMultiplier(temperature: number, humidity: number, distanceMeters: number): number {
    let multiplier = 1.0;

    // Temperature factor
    if (temperature > 15) {
      multiplier += (temperature - 15) * 0.02; // +2% per °C above 15
    }

    // Humidity factor (if temp > 18°C)
    if (temperature > 18 && humidity > 60) {
      multiplier += (humidity - 60) * 0.005; // +0.5% per % humidity above 60
    }

    // Distance factor (longer races need more hydration)
    const distanceKm = distanceMeters / 1000;
    if (distanceKm > 21) {
      multiplier *= 1.1;
    }

    // Cap at 2.0x base needs
    return Math.min(multiplier, 2.0);
  }

  /**
   * Generate pacing advice based on conditions
   */
  private generatePacingAdvice(
    temperature: number,
    humidity: number,
    heatStressLevel: HeatStressLevel,
    impactPercent: number,
  ): string {
    if (heatStressLevel === HeatStressLevel.EXTREME) {
      return 'EXTREME HEAT: Start 10-15% slower. Prioritize hydration and cooling. Consider DNS if heat index > 46°C.';
    }

    if (heatStressLevel === HeatStressLevel.HIGH) {
      return 'High heat stress: Start 8-10% slower. Focus on even effort, not pace. Increase hydration significantly.';
    }

    if (impactPercent > 5) {
      return 'Challenging conditions: Adjust goal pace by 5-10 sec/km. Even effort is more important than pace today.';
    }

    if (impactPercent > 2) {
      return 'Moderate impact expected: Start conservatively, adjust pace based on feel. Stay hydrated.';
    }

    if (impactPercent < -2) {
      return 'Favorable conditions for racing! Perfect weather for a PR attempt.';
    }

    return 'Good conditions: Stick to race plan, minor adjustments only.';
  }

  /**
   * Generate risk warnings
   */
  private generateRiskWarnings(
    temperature: number,
    humidity: number,
    windSpeedKmh: number,
    heatStressLevel: HeatStressLevel,
  ): string[] {
    const warnings: string[] = [];

    if (heatStressLevel === HeatStressLevel.EXTREME) {
      warnings.push('EXTREME HEAT WARNING: High risk of heat illness. Consider not starting.');
    }

    if (heatStressLevel === HeatStressLevel.HIGH) {
      warnings.push('Heat stress warning: Monitor for signs of heat exhaustion. Slow down if feeling dizzy or nauseated.');
    }

    if (temperature > 30) {
      warnings.push('High temperature: Apply sunscreen, wear light colors, and use ice/cooling strategically.');
    }

    if (humidity > 80 && temperature > 20) {
      warnings.push('High humidity: Sweat will not evaporate efficiently. Increase fluid intake.');
    }

    if (windSpeedKmh > 40) {
      warnings.push('Strong winds: Adjust pacing for headwind sections. Be cautious of dehydration from wind.');
    }

    return warnings;
  }
}
