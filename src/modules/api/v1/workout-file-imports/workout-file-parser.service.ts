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
  distanceMeters: number;
  avgHeartRate?: number;
  avgPaceSecondsPerKm?: number;
  startLatitude?: number;
  startLongitude?: number;
  startElevation?: number;
}

export interface ParsedWorkoutFile {
  startTime: Date;
  endTime?: Date;
  totalDurationSeconds?: number;
  totalDistanceMeters?: number;
  elevationGainMeters?: number;
  elevationLossMeters?: number;
  metrics: ParsedMetric[];
  routePoints: ParsedRoutePoint[];
  laps: ParsedLap[];
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
    let elevationGain = 0;
    let elevationLoss = 0;
    let lastElevation: number | undefined;

    // Log first record for debugging
    if (data.records && data.records.length > 0) {
      this.logger.debug(`Sample record fields: ${Object.keys(data.records[0]).join(', ')}`);
    }

    // Extract from session
    if (data.sessions && data.sessions.length > 0) {
      const session = data.sessions[0];
      if (session.start_time) startTime = new Date(session.start_time);
      if (session.total_elapsed_time) totalDuration = session.total_elapsed_time;
      if (session.total_distance) totalDistance = session.total_distance;
      if (session.total_ascent) elevationGain = session.total_ascent;
      if (session.total_descent) elevationLoss = session.total_descent;
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
        const lapDuration = lap.total_elapsed_time || lap.total_timer_time || 0;
        const lapDistance = lap.total_distance || 0;

        const avgPace = lapDistance > 0 ? (lapDuration / lapDistance) * 1000 : undefined;

        laps.push({
          lapNumber,
          startTime: lapStartTime!,
          totalTimeSeconds: lapDuration,
          distanceMeters: lapDistance,
          avgHeartRate: lap.avg_heart_rate,
          avgPaceSecondsPerKm: avgPace,
          startLatitude: lap.start_position_lat,
          startLongitude: lap.start_position_long,
        });

        lapNumber++;
      }
    }

    if (!startTime) {
      startTime = new Date();
    }

    return {
      startTime,
      endTime,
      totalDurationSeconds: totalDuration || (endTime ? (endTime.getTime() - startTime.getTime()) / 1000 : undefined),
      totalDistanceMeters: totalDistance || undefined,
      elevationGainMeters: elevationGain || undefined,
      elevationLossMeters: elevationLoss || undefined,
      metrics,
      routePoints,
      laps,
    };
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

    // Find all Lap elements
    const lapElements = doc.getElementsByTagName('Lap');
    let lapNumber = 1;

    for (let i = 0; i < lapElements.length; i++) {
      const lapEl = lapElements[i];
      const lapStartTimeAttr = lapEl.getAttribute('StartTime');
      const lapStartTime = lapStartTimeAttr ? new Date(lapStartTimeAttr) : undefined;

      if (!startTime && lapStartTime) startTime = lapStartTime;

      const lapTotalTime = this.getElementFloat(lapEl, 'TotalTimeSeconds') || 0;
      const lapDistance = this.getElementFloat(lapEl, 'DistanceMeters') || 0;
      const lapAvgHr = this.getElementFloat(lapEl, 'AverageHeartRateBpm/Value');

      totalDuration += lapTotalTime;
      totalDistance += lapDistance;

      const avgPace = lapDistance > 0 ? (lapTotalTime / lapDistance) * 1000 : undefined;

      laps.push({
        lapNumber,
        startTime: lapStartTime || startTime || new Date(),
        totalTimeSeconds: lapTotalTime,
        distanceMeters: lapDistance,
        avgHeartRate: lapAvgHr,
        avgPaceSecondsPerKm: avgPace,
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

    return {
      startTime,
      endTime,
      totalDurationSeconds: totalDuration || undefined,
      totalDistanceMeters: totalDistance || undefined,
      elevationGainMeters: elevationGain || undefined,
      elevationLossMeters: elevationLoss || undefined,
      metrics,
      routePoints,
      laps,
    };
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
          const avgPace = lapDuration / 1; // 1 km

          laps.push({
            lapNumber,
            startTime: lapStartTime,
            totalTimeSeconds: lapDuration,
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
      totalDistanceMeters: totalDistance || undefined,
      elevationGainMeters: elevationGain || undefined,
      elevationLossMeters: elevationLoss || undefined,
      metrics,
      routePoints,
      laps,
    };
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
}
