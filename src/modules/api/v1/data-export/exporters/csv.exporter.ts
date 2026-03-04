import { Injectable, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';

export interface ExportData {
  workouts: any[];
  workoutExecutions: any[];
  cardioMetrics: any[];
  routes: any[];
  healthMetrics: any[];
  personalRecords: any[];
  trainingLoad: any[];
  userSettings: any[];
  sleepLogs: any[];
}

@Injectable()
export class CsvExporter {
  private readonly logger = new Logger(CsvExporter.name);

  async export(data: ExportData): Promise<Buffer> {
    const zip = new AdmZip();

    if (data.workouts.length > 0) {
      zip.addFile('workouts.csv', Buffer.from(this.toCsv(data.workouts)));
    }

    if (data.workoutExecutions.length > 0) {
      zip.addFile('workout_executions.csv', Buffer.from(this.toCsv(data.workoutExecutions)));
    }

    if (data.cardioMetrics.length > 0) {
      zip.addFile('cardio_metrics.csv', Buffer.from(this.toCsv(data.cardioMetrics)));
    }

    if (data.routes.length > 0) {
      zip.addFile('routes.csv', Buffer.from(this.toCsv(data.routes)));
    }

    if (data.healthMetrics.length > 0) {
      zip.addFile('health_metrics.csv', Buffer.from(this.toCsv(data.healthMetrics)));
    }

    if (data.personalRecords.length > 0) {
      zip.addFile('personal_records.csv', Buffer.from(this.toCsv(data.personalRecords)));
    }

    if (data.trainingLoad.length > 0) {
      zip.addFile('training_load.csv', Buffer.from(this.toCsv(data.trainingLoad)));
    }

    if (data.userSettings.length > 0) {
      zip.addFile('user_settings.csv', Buffer.from(this.toCsv(data.userSettings)));
    }

    if (data.sleepLogs.length > 0) {
      zip.addFile('sleep_logs.csv', Buffer.from(this.toCsv(data.sleepLogs)));
    }

    // Add metadata
    const metadata = {
      exportedAt: new Date().toISOString(),
      format: 'csv',
      totalRecords: Object.values(data).reduce((sum, arr) => sum + arr.length, 0),
    };
    zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));

    return zip.toBuffer();
  }

  private toCsv(rows: any[]): string {
    if (rows.length === 0) {
      return '';
    }

    const headers = Object.keys(rows[0]);
    const csvRows = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => this.escapeCsvValue(row[header])).join(',')),
    ];

    return csvRows.join('\n');
  }

  private escapeCsvValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object') {
      value = JSON.stringify(value);
    }

    const stringValue = String(value);

    // Escape quotes and wrap in quotes if contains special characters
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }
}
