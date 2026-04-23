import { Injectable, Logger } from '@nestjs/common';
import { DOMParser } from '@xmldom/xmldom';
import * as FitParser from 'fit-file-parser';
import { CardioMetricType, WorkoutFileFormat } from 'src/database/interfaces';

export interface ParsedMetric {
  metricType: CardioMetricType;
  recordedAt: Date;
  value: number;
  unit: string;
}

export interface ParsedRoutePoint {
  latitude: number;
  longitude: number;
  elevation?: number;
  timestamp: Date;
}

export interface ParsedLap {
  lapNumber: number;
  startTime: Date;
  totalTimeSeconds: number;
  /** Elapsed time excluding pauses (moving time) */
  elapsedTimeSeconds: number;
  distanceMeters: number;
  avgHeartRate?: number;
  /** Average pace calculated from elapsed time (excluding pauses) */
  avgPaceSecondsPerKm?: number;
  startLatitude?: number;
  startLongitude?: number;
  startElevation?: number;
  /** Detected step name/type (e.g., "Warm Up", "Interval", "Recovery", "Cool Down") */
  name?: string;
  /** Intensity level if detected (active, rest, warmup, cooldown) */
  intensity?: 'active' | 'rest' | 'warmup' | 'cooldown';
}

export type DetectedSportType = 'run' | 'cycling' | 'swimming' | 'unknown';

export interface PausePeriod {
  /** Start time of the pause */
  startTime: Date;
  /** End time of the pause */
  endTime: Date;
  /** Duration in seconds */
  durationSeconds: number;
}

export interface ParsedWorkoutFile {
  startTime: Date;
  endTime?: Date;
  totalDurationSeconds?: number;
  /** Total elapsed time excluding pauses (moving time) */
  elapsedDurationSeconds?: number;
  totalDistanceMeters?: number;
  elevationGainMeters?: number;
  elevationLossMeters?: number;
  metrics: ParsedMetric[];
  routePoints: ParsedRoutePoint[];
  laps: ParsedLap[];
  /** Detected sport type from file metadata */
  sportType: DetectedSportType;
  /** Original sport name from the file (e.g., "trail_running", "road_cycling") */
  sportName?: string;
  /** Detected pause periods during the workout */
  pauses: PausePeriod[];
}

@Injectable()
export class WorkoutFileParserService {
  private readonly logger = new Logger(WorkoutFileParserService.name);

  async parse(buffer: Buffer, format: WorkoutFileFormat): Promise<ParsedWorkoutFile> {
    switch (format) {
      case WorkoutFileFormat.FIT:
        return this.parseFIT(buffer);
      case WorkoutFileFormat.TCX:
        return this.parseTCX(buffer);
      case WorkoutFileFormat.GPX:
        return this.parseGPX(buffer);
      default:
        throw new Error(`Unsupported file format: ${format}`);
    }
  }

  private async parseFIT(buffer: Buffer): Promise<ParsedWorkoutFile> {
    return new Promise((resolve, reject) => {
      const fitParser = new FitParser.default({
        force: true,
        speedUnit: 'm/s',
        lengthUnit: 'm',
        temperatureUnit: 'celsius',
        elapsedRecordField: true,
        mode: 'list', // Use 'list' mode for standard record structure
      });

      // Convert Node.js Buffer to ArrayBuffer for the FIT parser
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      fitParser.parse(arrayBuffer, (error: string | undefined, data: any) => {
        if (error) {
          this.logger.error('FIT parse error:', error);
          reject(new Error(error));
          return;
        }

        try {
          // Log available data structure for debugging
          this.logger.debug(`FIT data keys: ${Object.keys(data || {}).join(', ')}`);
          this.logger.debug(`Records count: ${data?.records?.length ?? 0}`);
          this.logger.debug(`Sessions count: ${data?.sessions?.length ?? 0}`);
          this.logger.debug(`Laps count: ${data?.laps?.length ?? 0}`);

          const result = this.extractFromFIT(data);
          resolve(result);
        } catch (err) {
          this.logger.error('FIT extraction error:', err);
          reject(err);
        }
      });
    });
  }

  private extractFromFIT(data: any): ParsedWorkoutFile {
    const metrics: ParsedMetric[] = [];
    const routePoints: ParsedRoutePoint[] = [];
    const laps: ParsedLap[] = [];

    let startTime: Date | undefined;
    let endTime: Date | undefined;
    let totalDistance = 0;
    let totalDuration = 0;
    let elapsedDuration = 0; // Moving time without pauses
    let elevationGain = 0;
    let elevationLoss = 0;
    let lastElevation: number | undefined;
    let sportType: DetectedSportType = 'unknown';
    let sportName: string | undefined;

    // Log first record for debugging
    if (data.records && data.records.length > 0) {
      this.logger.debug(`Sample record fields: ${Object.keys(data.records[0]).join(', ')}`);
    }

    // Extract from session
    if (data.sessions && data.sessions.length > 0) {
      const session = data.sessions[0];
      if (session.start_time) startTime = new Date(session.start_time);
      if (session.total_elapsed_time) totalDuration = session.total_elapsed_time;
      // total_timer_time is moving time (excludes pauses)
      if (session.total_timer_time) {
        elapsedDuration = session.total_timer_time;
      } else if (session.total_elapsed_time) {
        elapsedDuration = session.total_elapsed_time;
      }
      if (session.total_distance) totalDistance = session.total_distance;
      if (session.total_ascent) elevationGain = session.total_ascent;
      if (session.total_descent) elevationLoss = session.total_descent;

      // Detect sport type from session
      if (session.sport !== undefined) {
        sportName = session.sub_sport ? `${session.sport}_${session.sub_sport}` : session.sport;
        sportType = this.mapFitSportToType(session.sport, session.sub_sport);
        this.logger.debug(`Detected sport: ${session.sport}, sub_sport: ${session.sub_sport} -> ${sportType}`);
      }
    }

    // Extract from activity
    if (data.activity && !startTime) {
      if (data.activity.timestamp) startTime = new Date(data.activity.timestamp);
    }

    // Extract records (time-series data)
    if (data.records && Array.isArray(data.records)) {
      for (const record of data.records) {
        const timestamp = record.timestamp ? new Date(record.timestamp) : null;
        if (!timestamp) continue;

        if (!startTime) startTime = timestamp;
        endTime = timestamp;

        // Heart rate
        if (record.heart_rate !== undefined && record.heart_rate !== null) {
          metrics.push({
            metricType: CardioMetricType.HEART_RATE,
            recordedAt: timestamp,
            value: record.heart_rate,
            unit: 'bpm',
          });
        }

        // Cadence
        if (record.cadence !== undefined && record.cadence !== null) {
          metrics.push({
            metricType: CardioMetricType.CADENCE,
            recordedAt: timestamp,
            value: record.cadence,
            unit: 'rpm',
          });
        }

        // Power
        if (record.power !== undefined && record.power !== null) {
          metrics.push({
            metricType: CardioMetricType.POWER,
            recordedAt: timestamp,
            value: record.power,
            unit: 'watts',
          });
        }

        // Speed -> Pace
        if (record.speed !== undefined && record.speed !== null && record.speed > 0) {
          // Convert m/s to seconds per km
          const paceSecondsPerKm = 1000 / record.speed;
          metrics.push({
            metricType: CardioMetricType.PACE,
            recordedAt: timestamp,
            value: paceSecondsPerKm,
            unit: 's/km',
          });

          metrics.push({
            metricType: CardioMetricType.SPEED,
            recordedAt: timestamp,
            value: record.speed,
            unit: 'm/s',
          });
        }

        // Stride Length (FIT stores in mm, convert to m)
        if (record.stride_length !== undefined && record.stride_length !== null && record.stride_length > 0) {
          metrics.push({
            metricType: CardioMetricType.STRIDE_LENGTH,
            recordedAt: timestamp,
            value: record.stride_length / 1000,
            unit: 'm',
          });
        }

        // Vertical Oscillation (FIT stores in mm, convert to cm)
        if (record.vertical_oscillation !== undefined && record.vertical_oscillation !== null) {
          metrics.push({
            metricType: CardioMetricType.VERTICAL_OSCILLATION,
            recordedAt: timestamp,
            value: record.vertical_oscillation / 10,
            unit: 'cm',
          });
        }

        // Vertical Ratio (FIT stores as 0-10000, convert to %)
        if (record.vertical_ratio !== undefined && record.vertical_ratio !== null) {
          metrics.push({
            metricType: CardioMetricType.VERTICAL_RATIO,
            recordedAt: timestamp,
            value: record.vertical_ratio / 100,
            unit: '%',
          });
        }

        // Ground Contact Time (stance_time in ms)
        if (record.stance_time !== undefined && record.stance_time !== null) {
          metrics.push({
            metricType: CardioMetricType.GROUND_CONTACT_TIME,
            recordedAt: timestamp,
            value: record.stance_time,
            unit: 'ms',
          });
        }

        // Ground Contact Balance (stance_time_percent as %)
        if (record.stance_time_percent !== undefined && record.stance_time_percent !== null) {
          metrics.push({
            metricType: CardioMetricType.GROUND_CONTACT_BALANCE,
            recordedAt: timestamp,
            value: record.stance_time_percent,
            unit: '%',
          });
        }

        // GPS coordinates
        if (record.position_lat !== undefined && record.position_long !== undefined) {
          // FIT files store coordinates in semicircles, convert to degrees
          const lat =
            typeof record.position_lat === 'number' && Math.abs(record.position_lat) > 180
              ? record.position_lat * (180 / Math.pow(2, 31))
              : record.position_lat;
          const lon =
            typeof record.position_long === 'number' && Math.abs(record.position_long) > 180
              ? record.position_long * (180 / Math.pow(2, 31))
              : record.position_long;

          if (lat && lon && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            routePoints.push({
              latitude: lat,
              longitude: lon,
              elevation: record.altitude ?? record.enhanced_altitude,
              timestamp,
            });
          }
        }

        // Elevation for gain/loss calculation
        if (record.altitude !== undefined || record.enhanced_altitude !== undefined) {
          const elevation = record.enhanced_altitude ?? record.altitude;
          if (elevation !== undefined && lastElevation !== undefined) {
            const diff = elevation - lastElevation;
            if (diff > 0) elevationGain += diff;
            else elevationLoss += Math.abs(diff);
          }
          lastElevation = elevation;

          metrics.push({
            metricType: CardioMetricType.ELEVATION,
            recordedAt: timestamp,
            value: elevation,
            unit: 'm',
          });
        }
      }
    }

    // Extract laps
    if (data.laps && Array.isArray(data.laps)) {
      let lapNumber = 1;

      for (const lap of data.laps) {
        const lapStartTime = lap.start_time ? new Date(lap.start_time) : startTime;
        // total_elapsed_time includes pauses, total_timer_time is moving time
        const lapTotalTime = lap.total_elapsed_time || lap.total_timer_time || 0;
        // Prefer total_timer_time for elapsed time (moving time without pauses)
        const lapElapsedTime = lap.total_timer_time || lap.total_elapsed_time || 0;
        const lapDistance = lap.total_distance || 0;

        // Calculate pace from elapsed time (excluding pauses) for accurate pace
        const avgPace = lapDistance > 0 ? (lapElapsedTime / lapDistance) * 1000 : undefined;

        // Extract intensity from FIT lap data
        const intensity = this.mapFitIntensity(lap.intensity);
        const stepName = this.deriveStepName(intensity, lap.lap_trigger, lapNumber);

        laps.push({
          lapNumber,
          startTime: lapStartTime!,
          totalTimeSeconds: lapTotalTime,
          elapsedTimeSeconds: lapElapsedTime,
          distanceMeters: lapDistance,
          avgHeartRate: lap.avg_heart_rate,
          avgPaceSecondsPerKm: avgPace,
          startLatitude: lap.start_position_lat,
          startLongitude: lap.start_position_long,
          name: stepName,
          intensity,
        });

        lapNumber++;
      }
    }

    if (!startTime) {
      startTime = new Date();
    }

    // Detect pauses from FIT events or timestamp gaps
    const pauses = this.detectPausesFromFIT(data, metrics);

    return {
      startTime,
      endTime,
      totalDurationSeconds: totalDuration || (endTime ? (endTime.getTime() - startTime.getTime()) / 1000 : undefined),
      elapsedDurationSeconds: elapsedDuration || undefined,
      totalDistanceMeters: totalDistance || undefined,
      elevationGainMeters: elevationGain || undefined,
      elevationLossMeters: elevationLoss || undefined,
      metrics,
      routePoints,
      laps,
      sportType,
      sportName,
      pauses,
    };
  }

  /**
   * Detect pause periods from FIT event records or timestamp gaps
   */
  private detectPausesFromFIT(data: any, metrics: ParsedMetric[]): PausePeriod[] {
    const pauses: PausePeriod[] = [];

    // Method 1: Look for timer events in FIT data
    if (data.events && Array.isArray(data.events)) {
      let pauseStart: Date | null = null;

      for (const event of data.events) {
        const eventType = String(event.event || '').toLowerCase();
        const eventAction = String(event.event_type || '').toLowerCase();

        // Timer stop events indicate pause start
        if (
          (eventType === 'timer' && (eventAction === 'stop_all' || eventAction === 'stop')) ||
          eventType === 'stop_all'
        ) {
          if (event.timestamp && !pauseStart) {
            pauseStart = new Date(event.timestamp);
          }
        }

        // Timer start events indicate pause end
        if ((eventType === 'timer' && eventAction === 'start') || eventType === 'start') {
          if (event.timestamp && pauseStart) {
            const pauseEnd = new Date(event.timestamp);
            const durationSeconds = (pauseEnd.getTime() - pauseStart.getTime()) / 1000;
            if (durationSeconds > 2) {
              // Only count pauses longer than 2 seconds
              pauses.push({
                startTime: pauseStart,
                endTime: pauseEnd,
                durationSeconds,
              });
            }
            pauseStart = null;
          }
        }
      }
    }

    // Method 2: If no events found, detect pauses from timestamp gaps with zero/low speed
    if (pauses.length === 0 && metrics.length > 0) {
      const paceMetrics = metrics
        .filter((m) => m.metricType === CardioMetricType.PACE || m.metricType === CardioMetricType.SPEED)
        .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

      if (paceMetrics.length > 1) {
        const PAUSE_GAP_THRESHOLD_MS = 30000; // 30 seconds gap indicates pause
        const SLOW_PACE_THRESHOLD = 1800; // 30 min/km is essentially stopped

        for (let i = 1; i < paceMetrics.length; i++) {
          const prev = paceMetrics[i - 1];
          const curr = paceMetrics[i];
          const prevTime = new Date(prev.recordedAt).getTime();
          const currTime = new Date(curr.recordedAt).getTime();
          const gap = currTime - prevTime;

          // If there's a large gap in data, treat it as a pause
          if (gap > PAUSE_GAP_THRESHOLD_MS) {
            pauses.push({
              startTime: new Date(prev.recordedAt),
              endTime: new Date(curr.recordedAt),
              durationSeconds: gap / 1000,
            });
          }
          // Or if pace is very slow (essentially stopped) for multiple consecutive points
          else if (
            prev.metricType === CardioMetricType.PACE &&
            prev.value > SLOW_PACE_THRESHOLD &&
            curr.value > SLOW_PACE_THRESHOLD
          ) {
            // This could be a pause - but we need consecutive slow points
            // For simplicity, we rely more on the gap detection
          }
        }
      }
    }

    return pauses;
  }

  /**
   * Map FIT sport and sub_sport fields to our sport type enum
   */
  private mapFitSportToType(sport: string | number, subSport?: string | number): DetectedSportType {
    // FIT sport values can be strings or numbers depending on the parser
    const sportStr = String(sport).toLowerCase();
    const subSportStr = subSport ? String(subSport).toLowerCase() : undefined;

    // Running sports
    if (
      sportStr === 'running' ||
      sportStr === 'run' ||
      sportStr === '1' || // FIT enum value for running
      subSportStr === 'trail' ||
      subSportStr === 'track' ||
      subSportStr === 'treadmill'
    ) {
      return 'run';
    }

    // Cycling sports
    if (
      sportStr === 'cycling' ||
      sportStr === 'biking' ||
      sportStr === '2' || // FIT enum value for cycling
      subSportStr === 'road' ||
      subSportStr === 'mountain' ||
      subSportStr === 'gravel' ||
      subSportStr === 'indoor_cycling' ||
      subSportStr === 'spin'
    ) {
      return 'cycling';
    }

    // Swimming sports
    if (
      sportStr === 'swimming' ||
      sportStr === 'swim' ||
      sportStr === '5' || // FIT enum value for swimming
      subSportStr === 'lap_swimming' ||
      subSportStr === 'open_water'
    ) {
      return 'swimming';
    }

    return 'unknown';
  }

  /**
   * Map FIT intensity field to our intensity type
   * FIT intensity values: 0=active, 1=rest, 2=warmup, 3=cooldown
   */
  private mapFitIntensity(intensity: string | number | undefined): ParsedLap['intensity'] | undefined {
    if (intensity === undefined || intensity === null) return undefined;

    const intensityStr = String(intensity).toLowerCase();

    // Handle both string and numeric values
    if (intensityStr === 'warmup' || intensityStr === '2' || intensityStr === 'warm_up') {
      return 'warmup';
    }
    if (intensityStr === 'cooldown' || intensityStr === '3' || intensityStr === 'cool_down') {
      return 'cooldown';
    }
    if (intensityStr === 'rest' || intensityStr === '1' || intensityStr === 'recovery') {
      return 'rest';
    }
    if (intensityStr === 'active' || intensityStr === '0') {
      return 'active';
    }

    return undefined;
  }

  /**
   * Derive a human-readable step name from intensity and lap context
   */
  private deriveStepName(
    intensity: ParsedLap['intensity'] | undefined,
    lapTrigger: string | number | undefined,
    lapNumber: number,
  ): string | undefined {
    // First priority: derive from intensity
    if (intensity === 'warmup') return 'Warm Up';
    if (intensity === 'cooldown') return 'Cool Down';
    if (intensity === 'rest') return 'Recovery';

    // For active laps, check if it might be an interval based on lap trigger
    if (intensity === 'active' && lapTrigger) {
      const triggerStr = String(lapTrigger).toLowerCase();
      // manual lap press often indicates intervals
      if (triggerStr === 'manual' || triggerStr === '1') {
        return 'Interval';
      }
    }

    // No specific name detected
    return undefined;
  }

  private parseTCX(buffer: Buffer): ParsedWorkoutFile {
    const xmlString = buffer.toString('utf-8');
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    const metrics: ParsedMetric[] = [];
    const routePoints: ParsedRoutePoint[] = [];
    const laps: ParsedLap[] = [];

    let startTime: Date | undefined;
    let endTime: Date | undefined;
    let totalDistance = 0;
    let totalDuration = 0;
    let elevationGain = 0;
    let elevationLoss = 0;
    let lastElevation: number | undefined;
    let sportType: DetectedSportType = 'unknown';
    let sportName: string | undefined;

    // Detect sport from Activity element
    const activityElements = doc.getElementsByTagName('Activity');
    if (activityElements.length > 0) {
      const sportAttr = activityElements[0].getAttribute('Sport');
      if (sportAttr) {
        sportName = sportAttr;
        sportType = this.mapTcxSportToType(sportAttr);
        this.logger.debug(`TCX detected sport: ${sportAttr} -> ${sportType}`);
      }
    }

    // Find all Lap elements
    const lapElements = doc.getElementsByTagName('Lap');
    let lapNumber = 1;

    for (let i = 0; i < lapElements.length; i++) {
      const lapEl = lapElements[i];
      const lapStartTimeAttr = lapEl.getAttribute('StartTime');
      const lapStartTime = lapStartTimeAttr ? new Date(lapStartTimeAttr) : undefined;

      if (!startTime && lapStartTime) startTime = lapStartTime;

      // TCX TotalTimeSeconds is typically moving/timer time (already excludes pauses)
      const lapTotalTime = this.getElementFloat(lapEl, 'TotalTimeSeconds') || 0;
      const lapDistance = this.getElementFloat(lapEl, 'DistanceMeters') || 0;
      const lapAvgHr = this.getElementFloat(lapEl, 'AverageHeartRateBpm/Value');

      totalDuration += lapTotalTime;
      totalDistance += lapDistance;

      // TCX TotalTimeSeconds is already moving time, use it as elapsed time
      const lapElapsedTime = lapTotalTime;
      // Calculate pace from elapsed time (TCX already has moving time)
      const avgPace = lapDistance > 0 ? (lapElapsedTime / lapDistance) * 1000 : undefined;

      // Extract intensity from TCX Lap element
      const intensityEl = lapEl.getElementsByTagName('Intensity')[0];
      const tcxIntensity = intensityEl?.textContent?.toLowerCase();
      const intensity = this.mapTcxIntensity(tcxIntensity);
      const stepName = this.deriveTcxStepName(intensity, lapNumber, lapElements.length);

      laps.push({
        lapNumber,
        startTime: lapStartTime || startTime || new Date(),
        totalTimeSeconds: lapTotalTime,
        elapsedTimeSeconds: lapElapsedTime,
        distanceMeters: lapDistance,
        avgHeartRate: lapAvgHr,
        avgPaceSecondsPerKm: avgPace,
        name: stepName,
        intensity,
      });

      lapNumber++;

      // Extract trackpoints
      const trackpoints = lapEl.getElementsByTagName('Trackpoint');
      for (let j = 0; j < trackpoints.length; j++) {
        const tp = trackpoints[j];
        const timeEl = tp.getElementsByTagName('Time')[0];
        if (!timeEl) continue;

        const timestamp = new Date(timeEl.textContent || '');
        endTime = timestamp;

        // Heart rate
        const hr = this.getElementFloat(tp, 'HeartRateBpm/Value');
        if (hr) {
          metrics.push({
            metricType: CardioMetricType.HEART_RATE,
            recordedAt: timestamp,
            value: hr,
            unit: 'bpm',
          });
        }

        // Cadence
        const cadence = this.getElementFloat(tp, 'Cadence');
        if (cadence) {
          metrics.push({
            metricType: CardioMetricType.CADENCE,
            recordedAt: timestamp,
            value: cadence,
            unit: 'rpm',
          });
        }

        // Position
        const positionEl = tp.getElementsByTagName('Position')[0];
        if (positionEl) {
          const lat = this.getElementFloat(positionEl, 'LatitudeDegrees');
          const lon = this.getElementFloat(positionEl, 'LongitudeDegrees');
          const altitude = this.getElementFloat(tp, 'AltitudeMeters');

          if (lat && lon) {
            routePoints.push({
              latitude: lat,
              longitude: lon,
              elevation: altitude,
              timestamp,
            });
          }

          if (altitude !== undefined) {
            if (lastElevation !== undefined) {
              const diff = altitude - lastElevation;
              if (diff > 0) elevationGain += diff;
              else elevationLoss += Math.abs(diff);
            }
            lastElevation = altitude;

            metrics.push({
              metricType: CardioMetricType.ELEVATION,
              recordedAt: timestamp,
              value: altitude,
              unit: 'm',
            });
          }
        }

        // Extensions (power, etc.)
        const extensions = tp.getElementsByTagName('Extensions')[0];
        if (extensions) {
          const power = this.getElementFloat(extensions, 'Watts') || this.getElementFloat(extensions, 'ns3:Watts');
          if (power) {
            metrics.push({
              metricType: CardioMetricType.POWER,
              recordedAt: timestamp,
              value: power,
              unit: 'watts',
            });
          }
        }
      }
    }

    if (!startTime) {
      startTime = new Date();
    }

    // Detect pauses from timestamp gaps in TCX
    const pauses = this.detectPausesFromTimestampGaps(metrics);

    // TCX totalDuration is already moving time (sum of lap TotalTimeSeconds)
    return {
      startTime,
      endTime,
      totalDurationSeconds: totalDuration || undefined,
      elapsedDurationSeconds: totalDuration || undefined,
      totalDistanceMeters: totalDistance || undefined,
      elevationGainMeters: elevationGain || undefined,
      elevationLossMeters: elevationLoss || undefined,
      metrics,
      routePoints,
      laps,
      sportType,
      sportName,
      pauses,
    };
  }

  /**
   * Map TCX Sport attribute to our sport type enum
   */
  private mapTcxSportToType(sport: string): DetectedSportType {
    const sportLower = sport.toLowerCase();

    if (sportLower === 'running' || sportLower === 'run') {
      return 'run';
    }

    if (sportLower === 'biking' || sportLower === 'cycling') {
      return 'cycling';
    }

    if (sportLower === 'swimming' || sportLower === 'swim') {
      return 'swimming';
    }

    // TCX also uses "Other" for many activities
    return 'unknown';
  }

  /**
   * Map TCX Intensity element to our intensity type
   * TCX intensity values: "Active" or "Resting"
   */
  private mapTcxIntensity(intensity: string | undefined): ParsedLap['intensity'] | undefined {
    if (!intensity) return undefined;

    const intensityLower = intensity.toLowerCase();

    if (intensityLower === 'resting' || intensityLower === 'rest') {
      return 'rest';
    }
    if (intensityLower === 'active') {
      return 'active';
    }

    return undefined;
  }

  /**
   * Derive step name for TCX laps based on intensity and position
   */
  private deriveTcxStepName(
    intensity: ParsedLap['intensity'] | undefined,
    lapNumber: number,
    totalLaps: number,
  ): string | undefined {
    // Rest laps are recovery intervals
    if (intensity === 'rest') return 'Recovery';

    // Try to infer warmup/cooldown from position (heuristic)
    // First lap with active intensity might be warmup if there are multiple laps
    if (intensity === 'active' && totalLaps > 2) {
      if (lapNumber === 1) return 'Warm Up';
      if (lapNumber === totalLaps) return 'Cool Down';
    }

    return undefined;
  }

  private parseGPX(buffer: Buffer): ParsedWorkoutFile {
    const xmlString = buffer.toString('utf-8');
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    const metrics: ParsedMetric[] = [];
    const routePoints: ParsedRoutePoint[] = [];
    const laps: ParsedLap[] = [];

    let startTime: Date | undefined;
    let endTime: Date | undefined;
    let totalDistance = 0;
    let elevationGain = 0;
    let elevationLoss = 0;
    let lastElevation: number | undefined;
    let lastPoint: { lat: number; lon: number } | undefined;
    let sportType: DetectedSportType = 'unknown';
    let sportName: string | undefined;

    // Try to detect sport from track name or type
    const trkElements = doc.getElementsByTagName('trk');
    if (trkElements.length > 0) {
      const trkNameEl = trkElements[0].getElementsByTagName('name')[0];
      const trkTypeEl = trkElements[0].getElementsByTagName('type')[0];

      if (trkTypeEl?.textContent) {
        sportName = trkTypeEl.textContent;
        sportType = this.inferSportFromName(trkTypeEl.textContent);
      } else if (trkNameEl?.textContent) {
        // Try to infer from track name
        sportType = this.inferSportFromName(trkNameEl.textContent);
        if (sportType !== 'unknown') {
          sportName = trkNameEl.textContent;
        }
      }
    }

    // Find all track segments
    const trksegs = doc.getElementsByTagName('trkseg');

    for (let s = 0; s < trksegs.length; s++) {
      const seg = trksegs[s];
      const trkpts = seg.getElementsByTagName('trkpt');

      for (let i = 0; i < trkpts.length; i++) {
        const trkpt = trkpts[i];
        const lat = Number.parseFloat(trkpt.getAttribute('lat') || '');
        const lon = Number.parseFloat(trkpt.getAttribute('lon') || '');

        if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

        const timeEl = trkpt.getElementsByTagName('time')[0];
        const timestamp = timeEl ? new Date(timeEl.textContent || '') : new Date();

        if (!startTime) startTime = timestamp;
        endTime = timestamp;

        const eleEl = trkpt.getElementsByTagName('ele')[0];
        const elevation = eleEl ? Number.parseFloat(eleEl.textContent || '') : undefined;

        routePoints.push({
          latitude: lat,
          longitude: lon,
          elevation,
          timestamp,
        });

        // Calculate distance from last point
        if (lastPoint) {
          const dist = this.haversineDistance(lastPoint.lat, lastPoint.lon, lat, lon);
          totalDistance += dist;
        }
        lastPoint = { lat, lon };

        // Elevation
        if (elevation !== undefined && !Number.isNaN(elevation)) {
          if (lastElevation !== undefined) {
            const diff = elevation - lastElevation;
            if (diff > 0) elevationGain += diff;
            else elevationLoss += Math.abs(diff);
          }
          lastElevation = elevation;

          metrics.push({
            metricType: CardioMetricType.ELEVATION,
            recordedAt: timestamp,
            value: elevation,
            unit: 'm',
          });
        }

        // Check for extensions (heart rate, cadence, power)
        const extensions = trkpt.getElementsByTagName('extensions')[0];
        if (extensions) {
          // Garmin extensions
          const hr =
            this.getElementFloat(extensions, 'gpxtpx:hr') ||
            this.getElementFloat(extensions, 'hr') ||
            this.getElementFloat(extensions, 'heartrate');
          if (hr) {
            metrics.push({
              metricType: CardioMetricType.HEART_RATE,
              recordedAt: timestamp,
              value: hr,
              unit: 'bpm',
            });
          }

          const cad =
            this.getElementFloat(extensions, 'gpxtpx:cad') ||
            this.getElementFloat(extensions, 'cad') ||
            this.getElementFloat(extensions, 'cadence');
          if (cad) {
            metrics.push({
              metricType: CardioMetricType.CADENCE,
              recordedAt: timestamp,
              value: cad,
              unit: 'rpm',
            });
          }

          const power = this.getElementFloat(extensions, 'power') || this.getElementFloat(extensions, 'gpxtpx:power');
          if (power) {
            metrics.push({
              metricType: CardioMetricType.POWER,
              recordedAt: timestamp,
              value: power,
              unit: 'watts',
            });
          }
        }
      }
    }

    if (!startTime) {
      startTime = new Date();
    }

    const totalDuration = endTime ? (endTime.getTime() - startTime.getTime()) / 1000 : undefined;

    // Detect pauses from timestamp gaps FIRST (before creating km splits)
    // so we can calculate elapsed time correctly
    const pauses = this.detectPausesFromTimestampGaps(metrics);
    const totalPauseDuration = pauses.reduce((sum, p) => sum + p.durationSeconds, 0);
    const elapsedDuration = totalDuration ? totalDuration - totalPauseDuration : undefined;

    // Create kilometer splits as laps
    if (routePoints.length > 0) {
      let lapDistance = 0;
      let lapStartTime = startTime;
      let lapStartPoint = routePoints[0];
      let lapNumber = 1;
      let kmMarker = 1000;

      for (let i = 1; i < routePoints.length; i++) {
        const prevPoint = routePoints[i - 1];
        const currPoint = routePoints[i];
        const segmentDist = this.haversineDistance(
          prevPoint.latitude,
          prevPoint.longitude,
          currPoint.latitude,
          currPoint.longitude,
        );
        lapDistance += segmentDist;

        if (lapDistance >= kmMarker) {
          const lapDuration = (currPoint.timestamp.getTime() - lapStartTime.getTime()) / 1000;

          // Calculate elapsed time by subtracting pauses that overlap with this lap
          const lapPauseDuration = this.calculateOverlappingPauseDuration(pauses, lapStartTime, currPoint.timestamp);
          const lapElapsedTime = lapDuration - lapPauseDuration;

          // Calculate pace from elapsed time (excluding pauses)
          const avgPace = lapElapsedTime > 0 ? lapElapsedTime / 1 : lapDuration / 1; // 1 km

          laps.push({
            lapNumber,
            startTime: lapStartTime,
            totalTimeSeconds: lapDuration,
            elapsedTimeSeconds: lapElapsedTime,
            distanceMeters: 1000,
            avgPaceSecondsPerKm: avgPace,
            startLatitude: lapStartPoint.latitude,
            startLongitude: lapStartPoint.longitude,
            startElevation: lapStartPoint.elevation,
          });

          lapStartTime = currPoint.timestamp;
          lapStartPoint = currPoint;
          lapNumber++;
          kmMarker += 1000;
        }
      }
    }

    return {
      startTime,
      endTime,
      totalDurationSeconds: totalDuration,
      elapsedDurationSeconds: elapsedDuration,
      totalDistanceMeters: totalDistance || undefined,
      elevationGainMeters: elevationGain || undefined,
      elevationLossMeters: elevationLoss || undefined,
      metrics,
      routePoints,
      laps,
      sportType,
      sportName,
      pauses,
    };
  }

  /**
   * Infer sport type from a name/type string (for GPX files)
   */
  private inferSportFromName(name: string): DetectedSportType {
    const lower = name.toLowerCase();

    // Running keywords
    if (
      lower.includes('run') ||
      lower.includes('jog') ||
      lower.includes('trail') ||
      lower.includes('marathon') ||
      lower.includes('5k') ||
      lower.includes('10k')
    ) {
      return 'run';
    }

    // Cycling keywords
    if (
      lower.includes('cycling') ||
      lower.includes('bike') ||
      lower.includes('ride') ||
      lower.includes('biking') ||
      lower.includes('cycle')
    ) {
      return 'cycling';
    }

    // Swimming keywords
    if (lower.includes('swim') || lower.includes('pool') || lower.includes('lap')) {
      return 'swimming';
    }

    return 'unknown';
  }

  private getElementFloat(parent: Element, path: string): number | undefined {
    const parts = path.split('/');
    let el: Element | null = parent;

    for (const part of parts) {
      if (!el) return undefined;
      const children: HTMLCollectionOf<Element> = el.getElementsByTagName(part);
      el = children.length > 0 ? children[0] : null;
    }

    if (!el || !el.textContent) return undefined;
    const value = Number.parseFloat(el.textContent);
    return Number.isNaN(value) ? undefined : value;
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Calculate total pause duration that overlaps with a given time range
   */
  private calculateOverlappingPauseDuration(pauses: PausePeriod[], rangeStart: Date, rangeEnd: Date): number {
    let totalOverlap = 0;

    for (const pause of pauses) {
      // Calculate overlap between pause period and the time range
      const overlapStart = Math.max(pause.startTime.getTime(), rangeStart.getTime());
      const overlapEnd = Math.min(pause.endTime.getTime(), rangeEnd.getTime());

      if (overlapEnd > overlapStart) {
        totalOverlap += (overlapEnd - overlapStart) / 1000; // Convert to seconds
      }
    }

    return totalOverlap;
  }

  /**
   * Detect pauses from timestamp gaps in metrics (for TCX and GPX files)
   */
  private detectPausesFromTimestampGaps(metrics: ParsedMetric[]): PausePeriod[] {
    const pauses: PausePeriod[] = [];

    if (metrics.length < 2) return pauses;

    // Sort metrics by timestamp
    const sortedMetrics = [...metrics].sort(
      (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
    );

    // Get unique timestamps to detect gaps
    const uniqueTimestamps = [...new Set(sortedMetrics.map((m) => new Date(m.recordedAt).getTime()))].sort(
      (a, b) => a - b,
    );

    const PAUSE_GAP_THRESHOLD_MS = 30000; // 30 seconds gap indicates pause

    for (let i = 1; i < uniqueTimestamps.length; i++) {
      const prev = uniqueTimestamps[i - 1];
      const curr = uniqueTimestamps[i];
      const gap = curr - prev;

      if (gap > PAUSE_GAP_THRESHOLD_MS) {
        pauses.push({
          startTime: new Date(prev),
          endTime: new Date(curr),
          durationSeconds: gap / 1000,
        });
      }
    }

    return pauses;
  }
}
