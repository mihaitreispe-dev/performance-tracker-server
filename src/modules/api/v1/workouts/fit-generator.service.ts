import { Injectable } from '@nestjs/common';
import { CardioStep, CardioStepGroup, CardioStepMode, CardioStepType, Workout } from 'src/database/interfaces';

/**
 * FIT file generator service for workout export
 *
 * FIT (Flexible and Interoperable Data Transfer) Protocol is a binary format
 * used by fitness devices (Garmin, Wahoo, etc.) for workout data exchange.
 *
 * This implementation creates FIT Workout files (.fit) that can be loaded
 * onto fitness devices for structured workout execution.
 */

// FIT Protocol constants
const FIT_PROTOCOL_VERSION = 0x10; // 1.0
const FIT_PROFILE_VERSION = 0x0815; // 21.21
const FIT_HEADER_SIZE = 14;
const FIT_HEADER_DATA_TYPE = '.FIT';

// FIT Message types
const FIT_MESG_NUM_FILE_ID = 0;
const FIT_MESG_NUM_WORKOUT = 26;
const FIT_MESG_NUM_WORKOUT_STEP = 27;

// FIT field definition numbers
const FIT_FIELD_TYPE = 0;
const FIT_FIELD_MANUFACTURER = 1;
const FIT_FIELD_PRODUCT = 2;
const FIT_FIELD_SERIAL_NUMBER = 3;
const FIT_FIELD_TIME_CREATED = 4;

// Workout message fields
const FIT_WORKOUT_FIELD_SPORT = 4;
const _FIT_WORKOUT_FIELD_CAPABILITIES = 5;
const FIT_WORKOUT_FIELD_NUM_VALID_STEPS = 6;
const FIT_WORKOUT_FIELD_WKT_NAME = 8;

// Workout step message fields
const _FIT_STEP_FIELD_WKT_STEP_NAME = 0;
const FIT_STEP_FIELD_DURATION_TYPE = 1;
const FIT_STEP_FIELD_DURATION_VALUE = 2;
const FIT_STEP_FIELD_TARGET_TYPE = 3;
const FIT_STEP_FIELD_TARGET_VALUE = 4;
const FIT_STEP_FIELD_CUSTOM_TARGET_LOW = 5;
const FIT_STEP_FIELD_CUSTOM_TARGET_HIGH = 6;
const FIT_STEP_FIELD_INTENSITY = 7;
const FIT_STEP_FIELD_MESSAGE_INDEX = 254;

// FIT Sport types
const FIT_SPORT_RUNNING = 1;
const FIT_SPORT_CYCLING = 2;
const FIT_SPORT_SWIMMING = 5;

// FIT Duration types
const FIT_DURATION_TIME = 0;
const FIT_DURATION_DISTANCE = 1;
const FIT_DURATION_OPEN = 2;
const _FIT_DURATION_REPEAT_UNTIL_STEPS_CMPLT = 6;

// FIT Target types
const FIT_TARGET_OPEN = 0;
const FIT_TARGET_HEART_RATE = 1;
const FIT_TARGET_POWER = 4;
const FIT_TARGET_HEART_RATE_LAP = 7;

// FIT Intensity
const FIT_INTENSITY_ACTIVE = 0;
const FIT_INTENSITY_REST = 1;
const FIT_INTENSITY_WARMUP = 2;
const FIT_INTENSITY_COOLDOWN = 3;

// FIT base types
const FIT_BASE_TYPE_ENUM = 0x00;
const _FIT_BASE_TYPE_UINT8 = 0x00;
const FIT_BASE_TYPE_UINT16 = 0x84;
const FIT_BASE_TYPE_UINT32 = 0x86;
const FIT_BASE_TYPE_STRING = 0x07;

interface FitField {
  fieldDefNum: number;
  size: number;
  baseType: number;
}

interface FitMessage {
  localMesgNum: number;
  globalMesgNum: number;
  fields: FitField[];
  data: Buffer;
}

interface WorkoutStep {
  name?: string;
  durationType: number;
  durationValue: number;
  targetType: number;
  targetValue: number;
  customTargetLow: number;
  customTargetHigh: number;
  intensity: number;
}

@Injectable()
export class FitGeneratorService {
  /**
   * Generate a FIT workout file from a workout definition
   */
  generateWorkoutFit(
    workout: Workout,
    cardioSteps: CardioStep[],
    cardioStepGroups: Array<{ group: CardioStepGroup; items: CardioStep[] }>,
    workoutItems: Array<{ cardio_step_id: string | null; cardio_step_group_id: string | null; position: number }>,
  ): Buffer {
    // Convert workout to FIT steps
    const fitSteps = this.convertToFitSteps(cardioSteps, cardioStepGroups, workoutItems);

    // Build messages
    const messages: FitMessage[] = [];

    // File ID message (required first message)
    messages.push(this.createFileIdMessage());

    // Workout message
    messages.push(this.createWorkoutMessage(workout, fitSteps.length));

    // Workout step messages
    fitSteps.forEach((step, index) => {
      messages.push(this.createWorkoutStepMessage(step, index));
    });

    // Build the FIT file
    return this.buildFitFile(messages);
  }

  private convertToFitSteps(
    cardioSteps: CardioStep[],
    cardioStepGroups: Array<{ group: CardioStepGroup; items: CardioStep[] }>,
    workoutItems: Array<{ cardio_step_id: string | null; cardio_step_group_id: string | null; position: number }>,
  ): WorkoutStep[] {
    const steps: WorkoutStep[] = [];
    const stepMap = new Map(cardioSteps.map((s) => [s.id, s]));
    const groupMap = new Map(cardioStepGroups.map((g) => [g.group.id, g]));

    // Sort by position
    const sortedItems = [...workoutItems].sort((a, b) => a.position - b.position);

    for (const item of sortedItems) {
      if (item.cardio_step_id) {
        const step = stepMap.get(item.cardio_step_id);
        if (step) {
          steps.push(this.convertCardioStepToFitStep(step));
        }
      } else if (item.cardio_step_group_id) {
        const groupData = groupMap.get(item.cardio_step_group_id);
        if (groupData) {
          // For repeat groups, we add a repeat step and then the steps
          // FIT format handles repeats with duration type REPEAT_UNTIL_STEPS_CMPLT
          const repeatCount = groupData.group.repeat || 1;

          // Add individual steps for each repeat
          for (let i = 0; i < repeatCount; i++) {
            for (const groupStep of groupData.items) {
              steps.push(this.convertCardioStepToFitStep(groupStep));
            }
          }
        }
      }
    }

    return steps;
  }

  private convertCardioStepToFitStep(step: CardioStep): WorkoutStep {
    const intensity = this.mapStepTypeToIntensity(step.type);

    // Determine duration type and value
    let durationType = FIT_DURATION_OPEN;
    let durationValue = 0;

    if (step.mode === CardioStepMode.DURATION && step.duration) {
      durationType = FIT_DURATION_TIME;
      durationValue = step.duration * 1000; // Convert to milliseconds
    } else if (step.mode === CardioStepMode.DISTANCE && step.distance) {
      durationType = FIT_DURATION_DISTANCE;
      durationValue = step.distance * 100; // Convert to centimeters
    }

    // Determine target type and values
    let targetType = FIT_TARGET_OPEN;
    let targetValue = 0;
    let customTargetLow = 0;
    let customTargetHigh = 0;

    // Power targets take precedence
    if (step.power_min != null || step.power_max != null) {
      targetType = FIT_TARGET_POWER;
      customTargetLow = step.power_min ?? 0;
      customTargetHigh = step.power_max ?? step.power_min ?? 0;
    } else if (step.hr_min != null || step.hr_max != null) {
      // HR targets
      targetType = FIT_TARGET_HEART_RATE;
      customTargetLow = step.hr_min ? step.hr_min + 100 : 100; // FIT uses hrZone + 100 offset
      customTargetHigh = step.hr_max ? step.hr_max + 100 : 200;
    } else if (step.hr_zone != null) {
      // HR zone
      targetType = FIT_TARGET_HEART_RATE_LAP;
      targetValue = step.hr_zone;
    }

    return {
      name: step.notes || undefined,
      durationType,
      durationValue,
      targetType,
      targetValue,
      customTargetLow,
      customTargetHigh,
      intensity,
    };
  }

  private mapStepTypeToIntensity(type: CardioStepType): number {
    switch (type) {
      case CardioStepType.WARM_UP:
        return FIT_INTENSITY_WARMUP;
      case CardioStepType.COOL_DOWN:
        return FIT_INTENSITY_COOLDOWN;
      case CardioStepType.REST:
        return FIT_INTENSITY_REST;
      case CardioStepType.ACTIVITY:
      default:
        return FIT_INTENSITY_ACTIVE;
    }
  }

  private createFileIdMessage(): FitMessage {
    const fields: FitField[] = [
      { fieldDefNum: FIT_FIELD_TYPE, size: 1, baseType: FIT_BASE_TYPE_ENUM },
      { fieldDefNum: FIT_FIELD_MANUFACTURER, size: 2, baseType: FIT_BASE_TYPE_UINT16 },
      { fieldDefNum: FIT_FIELD_PRODUCT, size: 2, baseType: FIT_BASE_TYPE_UINT16 },
      { fieldDefNum: FIT_FIELD_SERIAL_NUMBER, size: 4, baseType: FIT_BASE_TYPE_UINT32 },
      { fieldDefNum: FIT_FIELD_TIME_CREATED, size: 4, baseType: FIT_BASE_TYPE_UINT32 },
    ];

    const data = Buffer.alloc(13);
    let offset = 0;

    // Type: workout = 5
    data.writeUInt8(5, offset);
    offset += 1;

    // Manufacturer: development = 255
    data.writeUInt16LE(255, offset);
    offset += 2;

    // Product: 0
    data.writeUInt16LE(0, offset);
    offset += 2;

    // Serial number
    data.writeUInt32LE(12345678, offset);
    offset += 4;

    // Time created (FIT timestamp = seconds since Dec 31, 1989)
    const fitEpoch = new Date('1989-12-31T00:00:00Z').getTime() / 1000;
    const now = Math.floor(Date.now() / 1000);
    const fitTimestamp = now - fitEpoch;
    data.writeUInt32LE(fitTimestamp, offset);

    return {
      localMesgNum: 0,
      globalMesgNum: FIT_MESG_NUM_FILE_ID,
      fields,
      data,
    };
  }

  private createWorkoutMessage(workout: Workout, numSteps: number): FitMessage {
    const workoutName = workout.name.slice(0, 32); // FIT string max 32 chars
    const nameLength = workoutName.length + 1; // +1 for null terminator

    const fields: FitField[] = [
      { fieldDefNum: FIT_WORKOUT_FIELD_WKT_NAME, size: nameLength, baseType: FIT_BASE_TYPE_STRING },
      { fieldDefNum: FIT_WORKOUT_FIELD_SPORT, size: 1, baseType: FIT_BASE_TYPE_ENUM },
      { fieldDefNum: FIT_WORKOUT_FIELD_NUM_VALID_STEPS, size: 2, baseType: FIT_BASE_TYPE_UINT16 },
    ];

    const data = Buffer.alloc(nameLength + 3);
    let offset = 0;

    // Workout name
    data.write(workoutName, offset, 'utf8');
    offset += nameLength;

    // Sport
    const sport = this.mapWorkoutTypeToSport(workout.type);
    data.writeUInt8(sport, offset);
    offset += 1;

    // Number of valid steps
    data.writeUInt16LE(numSteps, offset);

    return {
      localMesgNum: 1,
      globalMesgNum: FIT_MESG_NUM_WORKOUT,
      fields,
      data,
    };
  }

  private mapWorkoutTypeToSport(type: string): number {
    switch (type) {
      case 'cycling':
        return FIT_SPORT_CYCLING;
      case 'swimming':
        return FIT_SPORT_SWIMMING;
      case 'run':
      case 'cardio':
      case 'hiit':
      default:
        return FIT_SPORT_RUNNING;
    }
  }

  private createWorkoutStepMessage(step: WorkoutStep, index: number): FitMessage {
    const fields: FitField[] = [
      { fieldDefNum: FIT_STEP_FIELD_MESSAGE_INDEX, size: 2, baseType: FIT_BASE_TYPE_UINT16 },
      { fieldDefNum: FIT_STEP_FIELD_DURATION_TYPE, size: 1, baseType: FIT_BASE_TYPE_ENUM },
      { fieldDefNum: FIT_STEP_FIELD_DURATION_VALUE, size: 4, baseType: FIT_BASE_TYPE_UINT32 },
      { fieldDefNum: FIT_STEP_FIELD_TARGET_TYPE, size: 1, baseType: FIT_BASE_TYPE_ENUM },
      { fieldDefNum: FIT_STEP_FIELD_TARGET_VALUE, size: 4, baseType: FIT_BASE_TYPE_UINT32 },
      { fieldDefNum: FIT_STEP_FIELD_CUSTOM_TARGET_LOW, size: 4, baseType: FIT_BASE_TYPE_UINT32 },
      { fieldDefNum: FIT_STEP_FIELD_CUSTOM_TARGET_HIGH, size: 4, baseType: FIT_BASE_TYPE_UINT32 },
      { fieldDefNum: FIT_STEP_FIELD_INTENSITY, size: 1, baseType: FIT_BASE_TYPE_ENUM },
    ];

    const data = Buffer.alloc(21);
    let offset = 0;

    // Message index
    data.writeUInt16LE(index, offset);
    offset += 2;

    // Duration type
    data.writeUInt8(step.durationType, offset);
    offset += 1;

    // Duration value
    data.writeUInt32LE(step.durationValue, offset);
    offset += 4;

    // Target type
    data.writeUInt8(step.targetType, offset);
    offset += 1;

    // Target value
    data.writeUInt32LE(step.targetValue, offset);
    offset += 4;

    // Custom target low
    data.writeUInt32LE(step.customTargetLow, offset);
    offset += 4;

    // Custom target high
    data.writeUInt32LE(step.customTargetHigh, offset);
    offset += 4;

    // Intensity
    data.writeUInt8(step.intensity, offset);

    return {
      localMesgNum: 2,
      globalMesgNum: FIT_MESG_NUM_WORKOUT_STEP,
      fields,
      data,
    };
  }

  private buildFitFile(messages: FitMessage[]): Buffer {
    // Calculate data size
    let dataSize = 0;
    for (const msg of messages) {
      // Definition message: 1 (header) + 1 (reserved) + 1 (arch) + 2 (global) + 1 (num fields) + fields * 3
      dataSize += 6 + msg.fields.length * 3;
      // Data message: 1 (header) + data
      dataSize += 1 + msg.data.length;
    }

    // Allocate buffer for header + data + CRC
    const buffer = Buffer.alloc(FIT_HEADER_SIZE + dataSize + 2);
    let offset = 0;

    // Write header
    buffer.writeUInt8(FIT_HEADER_SIZE, offset); // Header size
    offset += 1;
    buffer.writeUInt8(FIT_PROTOCOL_VERSION, offset); // Protocol version
    offset += 1;
    buffer.writeUInt16LE(FIT_PROFILE_VERSION, offset); // Profile version
    offset += 2;
    buffer.writeUInt32LE(dataSize, offset); // Data size
    offset += 4;
    buffer.write(FIT_HEADER_DATA_TYPE, offset, 4, 'ascii'); // Data type
    offset += 4;
    const headerCrc = this.calculateCRC(buffer.subarray(0, 12));
    buffer.writeUInt16LE(headerCrc, offset); // Header CRC
    offset += 2;

    // Write messages
    for (const msg of messages) {
      // Write definition message
      const defHeader = 0x40 | msg.localMesgNum; // Definition message flag
      buffer.writeUInt8(defHeader, offset);
      offset += 1;
      buffer.writeUInt8(0, offset); // Reserved
      offset += 1;
      buffer.writeUInt8(0, offset); // Architecture (0 = little endian)
      offset += 1;
      buffer.writeUInt16LE(msg.globalMesgNum, offset); // Global message number
      offset += 2;
      buffer.writeUInt8(msg.fields.length, offset); // Number of fields
      offset += 1;

      // Write field definitions
      for (const field of msg.fields) {
        buffer.writeUInt8(field.fieldDefNum, offset);
        offset += 1;
        buffer.writeUInt8(field.size, offset);
        offset += 1;
        buffer.writeUInt8(field.baseType, offset);
        offset += 1;
      }

      // Write data message
      const dataHeader = msg.localMesgNum; // Data message (no flag)
      buffer.writeUInt8(dataHeader, offset);
      offset += 1;
      msg.data.copy(buffer, offset);
      offset += msg.data.length;
    }

    // Calculate and write file CRC
    const fileCrc = this.calculateCRC(buffer.subarray(0, offset));
    buffer.writeUInt16LE(fileCrc, offset);

    return buffer;
  }

  /**
   * Calculate CRC-16 for FIT file (uses FIT-specific polynomial)
   */
  private calculateCRC(data: Buffer): number {
    const crcTable = [
      0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01,
      0x8801, 0x4400,
    ];

    let crc = 0;
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      // Compute checksum of lower four bits
      let tmp = crcTable[crc & 0xf];
      crc = (crc >> 4) & 0x0fff;
      crc = crc ^ tmp ^ crcTable[byte & 0xf];
      // Compute checksum of upper four bits
      tmp = crcTable[crc & 0xf];
      crc = (crc >> 4) & 0x0fff;
      crc = crc ^ tmp ^ crcTable[(byte >> 4) & 0xf];
    }

    return crc;
  }
}
