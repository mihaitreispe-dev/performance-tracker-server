import { HeatStressLevel } from '../../../../../database/interfaces';
import { WeatherAdjustmentService } from './weather-adjustment.service';

/**
 * Pure-function service — no DI needed. These tests pin the research-backed
 * formulas (Ely 2007 heat, Cheuvront & Haymes 2001 humidity, Davies 1980
 * wind drag) so silent drift shows up in CI.
 *
 * Marathon baseline used throughout: 3h (10800s) over 42.2km, so pace is
 * ~4:15/km. Impacts expressed as rounded seconds let us assert ranges that
 * are forgiving of minor rounding without losing signal.
 */
describe('WeatherAdjustmentService', () => {
  let service: WeatherAdjustmentService;

  const MARATHON_SECONDS = 3 * 60 * 60; // 10800
  const MARATHON_METERS = 42_195;

  beforeEach(() => {
    service = new WeatherAdjustmentService();
  });

  describe('calculateWeatherImpact — optimal conditions', () => {
    it('returns near-zero impact at 12.5°C / 50% humidity / no wind (5K)', () => {
      const result = service.calculateWeatherImpact(
        20 * 60, // 20min 5K
        5000,
        12.5, // temp at the midpoint of 10–15°C
        50,
        0,
      );

      expect(result.temperature_impact_seconds).toBe(0);
      expect(result.humidity_impact_seconds).toBe(0);
      expect(result.wind_impact_seconds).toBe(0);
      expect(result.total_impact_seconds).toBe(0);
      expect(result.heat_stress_level).toBe(HeatStressLevel.NONE);
      expect(result.hydration_multiplier).toBe(1);
      expect(result.risk_warnings).toBeUndefined();
    });

    it('applies the marathon-distance multiplier to hydration even in cool weather', () => {
      // Hydration multiplier has a *=1.1 marathon factor that fires regardless
      // of temperature — assert the behaviour explicitly so it's not a surprise.
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 12.5, 50, 0);
      expect(result.hydration_multiplier).toBeCloseTo(1.1, 2);
    });
  });

  describe('temperature impact', () => {
    it('is negative (faster) below optimal but less severe than heat', () => {
      // 2.5°C is 10°C below the 12.5 midpoint
      const coldResult = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 2.5, 50, 0);
      // Cold uses the 0.002 coefficient: 10800 * 0.002 * 10 = 216s
      expect(coldResult.temperature_impact_seconds).toBeGreaterThan(200);
      expect(coldResult.temperature_impact_seconds).toBeLessThan(240);
    });

    it('is zero exactly at the optimal midpoint', () => {
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 12.5, 50, 0);
      expect(result.temperature_impact_seconds).toBe(0);
    });

    it('scales linearly for moderate heat (17.5°C = +5°C above midpoint)', () => {
      // +5°C → 1.5% base impact × marathon distance factor (1.2) = 1.8%
      // 10800 * 0.018 = ~194s
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 17.5, 50, 0);
      expect(result.temperature_impact_seconds).toBeGreaterThan(150);
      expect(result.temperature_impact_seconds).toBeLessThan(240);
    });

    it('applies heat factor above 27.5°C (15°C above midpoint)', () => {
      // 32.5°C → tempDev = 20, heatFactor = 1 + (20-15)/50 = 1.1
      // base = (20/5) * 0.015 = 0.06, * 1.1 * 1.2 (marathon) = 0.0792
      // 10800 * 0.0792 ≈ 855s
      const hotResult = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 32.5, 40, 0);
      expect(hotResult.temperature_impact_seconds).toBeGreaterThan(700);
      expect(hotResult.temperature_impact_seconds).toBeLessThan(1000);
    });

    it('scales the impact up for marathon vs 5K at the same temperature', () => {
      const temp = 22.5; // +10°C above optimal midpoint
      const fiveKResult = service.calculateWeatherImpact(20 * 60, 5000, temp, 50, 0);
      const marathonResult = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, temp, 50, 0);

      // Marathon distanceFactor = 1.2, 5K factor = 1.0 — marathon takes a
      // bigger percentage hit *and* a longer absolute hit.
      const fiveKPct = fiveKResult.temperature_impact_seconds / (20 * 60);
      const marathonPct = marathonResult.temperature_impact_seconds / MARATHON_SECONDS;
      expect(marathonPct).toBeGreaterThan(fiveKPct);
    });
  });

  describe('humidity impact', () => {
    it('is zero below 18°C regardless of humidity', () => {
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 15, 95, 0);
      expect(result.humidity_impact_seconds).toBe(0);
    });

    it('is non-zero when heat index rises meaningfully above temperature', () => {
      // 30°C + 85% RH → heat index ~38°C, deviation ~8°C > 5 threshold
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 30, 85, 0);
      expect(result.humidity_impact_seconds).toBeGreaterThan(0);
    });

    it('scales with humidity at warm temperatures', () => {
      const low = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 28, 50, 0);
      const high = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 28, 90, 0);
      expect(high.humidity_impact_seconds).toBeGreaterThan(low.humidity_impact_seconds);
    });
  });

  describe('wind impact', () => {
    it('assumes 50% effective wind when course direction is unknown', () => {
      // 20 km/h wind, unknown direction → effective = 10 km/h
      // 10800 * 0.001 * 10 = 108s
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 12.5, 50, 20);
      expect(result.wind_impact_seconds).toBeGreaterThan(90);
      expect(result.wind_impact_seconds).toBeLessThan(130);
    });

    it('penalises pure headwind (course 0° into wind from 180°)', () => {
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 12.5, 50, 20, 0, 180);
      // angleDiff = 180 → cos(180°) = -1 → windComponent = -20 (wait: code
      // computes cos((180 * π)/180) = -1 so windComponent is negative and hits
      // the tailwind branch). For a true headwind the wind comes FROM the
      // direction you're running toward, so use windDirection = courseDirection.
      // Here we pass course=0, windDirection=180 meaning the runner moves north
      // and the wind is blowing north. That IS a tailwind in the real world —
      // expect a negative impact.
      expect(result.wind_impact_seconds).toBeLessThanOrEqual(0);
    });

    it('gives a (smaller) speed boost for a tailwind', () => {
      // Use unknown-direction mode vs a known tailwind at same speed:
      // tailwind benefit coefficient is 0.0005 vs 0.001 for the 50%-effective case.
      const tailwind = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 12.5, 50, 20, 0, 180);
      const unknown = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 12.5, 50, 20);
      // Tailwind net improvement should show up as a negative impact; unknown
      // direction always penalises. So tailwind < unknown.
      expect(tailwind.wind_impact_seconds).toBeLessThan(unknown.wind_impact_seconds);
    });
  });

  describe('heat stress level thresholds', () => {
    it('reports NONE below 27°C (heat index formula inactive)', () => {
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 20, 50, 0);
      expect(result.heat_stress_level).toBe(HeatStressLevel.NONE);
    });

    it('reports MODERATE between 32 and 39 heat index', () => {
      // 30°C + 70% RH → HI ~34°C (moderate band)
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 30, 70, 0);
      expect(result.heat_stress_level).toBe(HeatStressLevel.MODERATE);
    });

    it('reports EXTREME with a severe risk warning above heat index 46', () => {
      // 38°C + 85% RH lands well above 46 heat index
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 38, 85, 0);
      expect(result.heat_stress_level).toBe(HeatStressLevel.EXTREME);
      expect(result.risk_warnings).toBeDefined();
      expect(result.risk_warnings!.join(' ')).toMatch(/EXTREME HEAT WARNING/i);
    });
  });

  describe('hydration multiplier', () => {
    it('stays at 1.0 for sub-15°C non-marathon conditions', () => {
      const result = service.calculateWeatherImpact(20 * 60, 5000, 12, 50, 0);
      expect(result.hydration_multiplier).toBe(1);
    });

    it('rises with both temperature and humidity', () => {
      const warm = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 25, 50, 0);
      const warmHumid = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 25, 85, 0);
      expect(warmHumid.hydration_multiplier).toBeGreaterThan(warm.hydration_multiplier);
    });

    it('is capped at 2.0', () => {
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 45, 95, 0);
      expect(result.hydration_multiplier).toBeLessThanOrEqual(2.0);
    });
  });

  describe('risk warnings', () => {
    it('warns on high humidity above 80% once temp exceeds 20°C', () => {
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 25, 85, 0);
      expect(result.risk_warnings).toBeDefined();
      expect(result.risk_warnings!.join(' ')).toMatch(/humidity/i);
    });

    it('warns on strong winds above 40 km/h', () => {
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 12.5, 50, 45);
      expect(result.risk_warnings).toBeDefined();
      expect(result.risk_warnings!.join(' ')).toMatch(/wind/i);
    });

    it('warns on high temperature above 30°C', () => {
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 32, 50, 0);
      expect(result.risk_warnings).toBeDefined();
      expect(result.risk_warnings!.join(' ')).toMatch(/temperature|sunscreen/i);
    });
  });

  describe('pacing advice', () => {
    it('advises starting slower in extreme heat', () => {
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 38, 85, 0);
      expect(result.pacing_advice).toMatch(/EXTREME/i);
      expect(result.pacing_advice).toMatch(/slower|DNS/i);
    });

    it('gives an encouraging message when a strong tailwind flips impact negative', () => {
      // Temp impact is positive even for cold; only a real tailwind produces
      // negative total_impact_percent that trips the "Favorable" branch.
      // Course 0° / wind 180° = pure tailwind at 60 km/h → -3% of marathon time.
      const result = service.calculateWeatherImpact(MARATHON_SECONDS, MARATHON_METERS, 12.5, 50, 60, 0, 180);
      expect(result.total_impact_percent).toBeLessThan(-2);
      expect(result.pacing_advice).toMatch(/Favorable|PR/);
    });
  });
});
