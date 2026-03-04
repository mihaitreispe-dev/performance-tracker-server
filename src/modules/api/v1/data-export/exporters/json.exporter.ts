import { Injectable, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';

import { ExportData } from './csv.exporter';

@Injectable()
export class JsonExporter {
  private readonly logger = new Logger(JsonExporter.name);

  async export(data: ExportData): Promise<Buffer> {
    const zip = new AdmZip();

    if (data.workouts.length > 0) {
      zip.addFile('workouts.json', Buffer.from(JSON.stringify(data.workouts, null, 2)));
    }

    if (data.workoutExecutions.length > 0) {
      zip.addFile('workout_executions.json', Buffer.from(JSON.stringify(data.workoutExecutions, null, 2)));
    }

    if (data.cardioMetrics.length > 0) {
      zip.addFile('cardio_metrics.json', Buffer.from(JSON.stringify(data.cardioMetrics, null, 2)));
    }

    if (data.routes.length > 0) {
      zip.addFile('routes.json', Buffer.from(JSON.stringify(data.routes, null, 2)));
    }

    if (data.healthMetrics.length > 0) {
      zip.addFile('health_metrics.json', Buffer.from(JSON.stringify(data.healthMetrics, null, 2)));
    }

    if (data.personalRecords.length > 0) {
      zip.addFile('personal_records.json', Buffer.from(JSON.stringify(data.personalRecords, null, 2)));
    }

    if (data.trainingLoad.length > 0) {
      zip.addFile('training_load.json', Buffer.from(JSON.stringify(data.trainingLoad, null, 2)));
    }

    if (data.userSettings.length > 0) {
      zip.addFile('user_settings.json', Buffer.from(JSON.stringify(data.userSettings, null, 2)));
    }

    if (data.sleepLogs.length > 0) {
      zip.addFile('sleep_logs.json', Buffer.from(JSON.stringify(data.sleepLogs, null, 2)));
    }

    // Add combined full export
    const fullExport = {
      metadata: {
        exportedAt: new Date().toISOString(),
        format: 'json',
        totalRecords: Object.values(data).reduce((sum, arr) => sum + arr.length, 0),
      },
      ...data,
    };
    zip.addFile('full_export.json', Buffer.from(JSON.stringify(fullExport, null, 2)));

    return zip.toBuffer();
  }
}
