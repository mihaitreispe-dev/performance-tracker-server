import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { type Request } from 'express';
import OpenAI from 'openai';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AppConfigService } from 'src/modules/config/app-config.service';

import { GeneratedResponseDTO, GenerateResponseBody } from './dto/generate-response.dto';
import { ParsedIntentDTO, ParseIntentBody, VoiceIntentType } from './dto/parse-intent.dto';
import { TranscriptionDTO } from './dto/transcribe.dto';

// OpenAI function definitions for intent parsing
const VOICE_FUNCTIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_fitness_fatigue',
      description:
        'Get fitness and fatigue data (CTL, ATL, TSB) for a period. Use for questions about training load, fitness level, fatigue, form, or overall training status.',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description: 'Number of days to look back (default 7, max 365)',
          },
          startDate: {
            type: 'string',
            description: 'Start date of the period (ISO format YYYY-MM-DD). Use for specific date ranges.',
          },
          endDate: {
            type: 'string',
            description: 'End date of the period (ISO format YYYY-MM-DD). Defaults to today if not specified.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_vo2max_history',
      description:
        'Get VO2 max history and trends. Use for questions about cardiovascular fitness, aerobic capacity, or VO2max.',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description: 'Number of days of history (default 90)',
          },
          startDate: {
            type: 'string',
            description: 'Start date of the period (ISO format YYYY-MM-DD). Use for specific date ranges.',
          },
          endDate: {
            type: 'string',
            description: 'End date of the period (ISO format YYYY-MM-DD). Defaults to today if not specified.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sleep_log',
      description: 'Get sleep data for a specific date. Use for questions about sleep quality, duration, or recovery.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description:
              'Date to get sleep for (ISO format, e.g., "2024-01-15"). Use relative terms like "yesterday", "3 days ago".',
          },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_training_load',
      description: 'Get current training load analysis. Use for questions about weekly training volume or load.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_personal_records',
      description: 'Get personal records (PRs). Use for questions about best performances, records, or PRs.',
      parameters: {
        type: 'object',
        properties: {
          exerciseId: {
            type: 'string',
            description: 'Optional exercise ID to filter PRs',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_period_summary',
      description:
        'Get a summary of training for a time period. Use for questions like "how is my week going", "monthly summary", "last 2 weeks", "how was January", etc.',
      parameters: {
        type: 'object',
        properties: {
          periodType: {
            type: 'string',
            enum: ['week', 'month', 'custom'],
            description:
              'Type of period: "week" for current week, "month" for current month, "custom" for specific date ranges or other periods.',
          },
          startDate: {
            type: 'string',
            description:
              'Start date of the period (ISO format YYYY-MM-DD). Required for custom periods. For "this week" use Monday of current week. For "last month" use first day of last month.',
          },
          endDate: {
            type: 'string',
            description:
              'End date of the period (ISO format YYYY-MM-DD). Required for custom periods. Defaults to today for ongoing periods.',
          },
          days: {
            type: 'number',
            description:
              'Alternative to date range - number of days to look back from today. Use for queries like "last 10 days" or "past 2 weeks" (14 days).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_workout',
      description: `Create a new workout. Supports multiple structures:

1. STRENGTH WORKOUTS - Use "items" array with exercise names or supersets:
   - Single exercise: { "type": "exercise", "name": "bench press" }
   - Superset/circuit (multiple exercises done back-to-back): { "type": "superset", "repeat": 3, "exercises": ["bench press", "rows"] }

2. CARDIO/INTERVAL WORKOUTS - Use "items" array with steps or interval groups:
   - Single step: { "type": "step", "stepType": "warm_up", "durationMinutes": 5 }
   - Interval group (repeated sequence): { "type": "intervals", "repeat": 5, "steps": [{ "stepType": "activity", "durationMinutes": 1 }, { "stepType": "rest", "durationMinutes": 1 }] }

Keywords that indicate grouping:
- "superset", "circuit", "back-to-back", "combined" → Use superset type for strength
- "intervals", "repeats", "rounds", "sets of" → Use intervals type for cardio OR superset repeat count for strength`,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Workout name. If not provided, a name will be generated.',
          },
          items: {
            type: 'array',
            description: 'Workout items - can be exercises, supersets, cardio steps, or interval groups',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['exercise', 'superset', 'step', 'intervals'],
                  description:
                    'Item type: exercise (single), superset (grouped exercises), step (single cardio), intervals (grouped cardio steps)',
                },
                name: {
                  type: 'string',
                  description: 'Exercise name (for type="exercise")',
                },
                exercises: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Exercise names in superset (for type="superset")',
                },
                repeat: {
                  type: 'number',
                  description: 'Number of times to repeat the group (for superset/intervals). Default 3.',
                },
                stepType: {
                  type: 'string',
                  enum: ['warm_up', 'activity', 'rest', 'cool_down'],
                  description: 'Step type (for type="step")',
                },
                durationMinutes: {
                  type: 'number',
                  description: 'Duration in minutes (for type="step")',
                },
                description: {
                  type: 'string',
                  description: 'Optional description',
                },
                steps: {
                  type: 'array',
                  description: 'Cardio steps in interval group (for type="intervals")',
                  items: {
                    type: 'object',
                    properties: {
                      stepType: {
                        type: 'string',
                        enum: ['warm_up', 'activity', 'rest', 'cool_down'],
                      },
                      durationMinutes: { type: 'number' },
                      description: { type: 'string' },
                    },
                    required: ['stepType', 'durationMinutes'],
                  },
                },
              },
              required: ['type'],
            },
          },
          difficulty: {
            type: 'string',
            enum: ['easy', 'moderate', 'hard', 'extreme'],
            description: 'Workout difficulty level. Defaults to "moderate" if not specified.',
          },
          workoutType: {
            type: 'string',
            enum: ['strength', 'cardio', 'flexibility', 'hiit', 'circuit', 'custom', 'run', 'cycling', 'swimming'],
            description: `Type of workout. IMPORTANT for cardio workouts:
- Use "run" for running workouts (jogging, sprints, treadmill, running intervals)
- Use "cycling" for cycling workouts (bike, spinning, cycling intervals)
- Use "swimming" for swimming workouts (laps, pool intervals)
- Use "cardio" ONLY for generic cardio that doesn't fit run/cycling/swimming
Auto-detect from context: "run intervals" → run, "cycling session" → cycling, "swim workout" → swimming`,
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_workout_plan',
      description:
        'Create a workout plan with multiple days. Use when user wants to create a training plan or schedule.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Plan name',
          },
          days: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { type: 'string', description: 'Day of the week' },
                workoutType: { type: 'string', description: 'Type of workout (strength, cardio, etc.)' },
              },
            },
            description: 'Days and workout types in the plan',
          },
        },
        required: ['days'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_workout',
      description:
        'Schedule a workout for a specific date. Use when user wants to schedule or plan a workout for a future date.',
      parameters: {
        type: 'object',
        properties: {
          workoutName: {
            type: 'string',
            description:
              'Name or description of the workout to schedule (e.g., "leg day", "morning run", "upper body"). Will be matched to existing workouts.',
          },
          date: {
            type: 'string',
            description:
              'Date to schedule (ISO format YYYY-MM-DD). Calculate actual dates: "tomorrow" → tomorrow\'s date, "next Monday" → next Monday\'s date, "Friday" → this coming Friday.',
          },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_sleep',
      description: 'Log sleep data. Use when user wants to record or log their sleep.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date of sleep (ISO format). "last night" = yesterday\'s date.',
          },
          hours: {
            type: 'number',
            description: 'Total sleep duration in hours',
          },
          quality: {
            type: 'number',
            description: 'Sleep quality rating 1-5',
          },
        },
        required: ['hours'],
      },
    },
  },
];

// Blocked actions that should not be allowed via voice
const BLOCKED_PATTERNS = [
  /delete|remove|erase/i,
  /password|email|account|settings/i,
  /start.*workout|begin.*session|live.*workout/i,
];

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private openai: OpenAI | null = null;

  constructor(private readonly configService: AppConfigService) {
    const apiKey = this.configService.get('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      this.logger.warn('OPENAI_API_KEY not configured - voice features will be disabled');
    }
  }

  private ensureOpenAI(): OpenAI {
    if (!this.openai) {
      throw new BadRequestException('Voice assistant is not configured. Please set OPENAI_API_KEY.');
    }
    return this.openai;
  }

  async transcribeAudio(
    _req: Request & { user: AuthUser },
    audioBuffer: Buffer,
    language?: string,
  ): Promise<TranscriptionDTO> {
    const openai = this.ensureOpenAI();

    try {
      // Create a File object from the buffer for the OpenAI API
      // Convert Buffer to Uint8Array for File constructor compatibility
      const uint8Array = new Uint8Array(audioBuffer);
      const audioFile = new File([uint8Array], 'audio.webm', { type: 'audio/webm' });

      const response = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: language,
        response_format: 'verbose_json',
      });

      return {
        text: response.text,
        detectedLanguage: response.language,
        confidence: undefined, // Whisper doesn't provide confidence scores
      };
    } catch (error) {
      this.logger.error(`Transcription failed: ${error}`);
      throw new BadRequestException('Failed to transcribe audio. Please try again.');
    }
  }

  async parseIntent(_req: Request & { user: AuthUser }, body: ParseIntentBody): Promise<ParsedIntentDTO> {
    const openai = this.ensureOpenAI();

    // Check for blocked actions first
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(body.text)) {
        return {
          intent: VoiceIntentType.BLOCKED,
          parameters: {},
          requiresConfirmation: false,
          blockedReason: this.getBlockedReason(body.text),
          confidence: 1.0,
        };
      }
    }

    try {
      const today = new Date();
      const todayISO = today.toISOString().split('T')[0];
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const mondayOfThisWeek = new Date(today);
      mondayOfThisWeek.setDate(today.getDate() + mondayOffset);
      const mondayISO = mondayOfThisWeek.toISOString().split('T')[0];

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are a fitness assistant that helps users query their fitness data and create workouts.

IMPORTANT DATE CONTEXT:
- Today's date: ${todayISO}
- Day of the week: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]}
- Monday of this week: ${mondayISO}

CRITICAL: When the user mentions ANY time period, you MUST calculate and provide actual ISO dates (YYYY-MM-DD format). Never leave dates vague.

Date calculation rules:
- "yesterday" → ${new Date(today.getTime() - 86400000).toISOString().split('T')[0]}
- "last night" (for sleep) → ${new Date(today.getTime() - 86400000).toISOString().split('T')[0]}
- "today" → ${todayISO}
- "tomorrow" → ${new Date(today.getTime() + 86400000).toISOString().split('T')[0]}
- "this week" → startDate: ${mondayISO}, endDate: ${todayISO}
- "last week" → calculate Monday to Sunday of the previous week
- "last X days" or "past X days" → use the "days" parameter with the number X
- "this month" → startDate: first day of current month, endDate: today
- "last month" → startDate: first day of previous month, endDate: last day of previous month
- "January" (or any month name in current year) → startDate: first day of that month, endDate: last day of that month
- Specific dates like "January 15" → convert to ISO format

For period-based queries (get_period_summary, get_fitness_fatigue, get_vo2max_history):
- Use "startDate" and "endDate" for specific date ranges
- Use "days" parameter for "last X days" style queries
- For get_period_summary, set periodType to "week", "month", or "custom" as appropriate

If the user's request is ambiguous or you're not sure what they want, ask for clarification.
If the request doesn't match any available function, explain what you can help with.`,
        },
      ];

      // Add conversation history if provided
      if (body.conversationHistory) {
        for (const msg of body.conversationHistory) {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }

      messages.push({
        role: 'user',
        content: body.text,
      });

      const response = await openai.chat.completions.create({
        model: this.configService.get('OPENAI_MODEL') || 'gpt-4-turbo',
        messages,
        tools: VOICE_FUNCTIONS,
        tool_choice: 'auto',
      });

      const message = response.choices[0]?.message;

      if (!message) {
        throw new Error('No response from OpenAI');
      }

      // If the model wants to call a function
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        // Type guard for standard function tool calls
        if (toolCall.type !== 'function') {
          throw new Error('Unexpected tool call type');
        }
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || '{}');

        const intent = this.mapFunctionToIntent(functionName);
        const requiresConfirmation = this.isWriteOperation(intent);

        return {
          intent,
          parameters: this.normalizeParameters(intent, args),
          requiresConfirmation,
          actionDescription: this.getActionDescription(intent, args),
          confidence: 0.9, // OpenAI doesn't provide confidence, using default
        };
      }

      // If the model responded with text (clarification or unknown intent)
      if (message.content) {
        return {
          intent: VoiceIntentType.CLARIFICATION_NEEDED,
          parameters: {},
          requiresConfirmation: false,
          clarificationQuestion: message.content,
          confidence: 0.5,
        };
      }

      return {
        intent: VoiceIntentType.UNKNOWN,
        parameters: {},
        requiresConfirmation: false,
        blockedReason:
          "I couldn't understand that request. Try asking about your fitness data, sleep, or creating workouts.",
        confidence: 0.3,
      };
    } catch (error) {
      this.logger.error(`Intent parsing failed: ${error}`);
      throw new BadRequestException('Failed to parse intent. Please try again.');
    }
  }

  async generateResponse(
    _req: Request & { user: AuthUser },
    body: GenerateResponseBody,
  ): Promise<GeneratedResponseDTO> {
    const openai = this.ensureOpenAI();

    // Handle error case
    if (body.success === false || body.errorMessage) {
      return {
        message: body.errorMessage || 'Sorry, something went wrong. Please try again.',
        suggestions: ['Try a different query', 'Ask for help'],
      };
    }

    try {
      const systemPrompt = `You are a fitness assistant providing natural language responses to fitness data queries.
Convert the following API response data into a conversational, helpful response.
Be concise but informative. Use encouraging language. Include specific numbers from the data.
If the data suggests something actionable, include a brief recommendation.`;

      const userPrompt = `User asked: "${body.originalQuery || 'N/A'}"
Intent: ${body.intent}
API Response Data:
${JSON.stringify(body.apiResponse, null, 2)}

Provide a natural, conversational response summarizing this data.`;

      const response = await openai.chat.completions.create({
        model: this.configService.get('OPENAI_MODEL') || 'gpt-4-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 500,
      });

      const message = response.choices[0]?.message?.content;

      if (!message) {
        throw new Error('No response from OpenAI');
      }

      return {
        message,
        suggestions: this.getSuggestionsForIntent(body.intent),
        displayData: body.apiResponse,
      };
    } catch (error) {
      this.logger.error(`Response generation failed: ${error}`);
      // Fallback to a simple response
      return {
        message: this.getFallbackResponse(body.intent, body.apiResponse),
        displayData: body.apiResponse,
      };
    }
  }

  private mapFunctionToIntent(functionName: string): VoiceIntentType {
    const mapping: Record<string, VoiceIntentType> = {
      get_fitness_fatigue: VoiceIntentType.GET_FITNESS_FATIGUE,
      get_vo2max_history: VoiceIntentType.GET_VO2MAX_HISTORY,
      get_sleep_log: VoiceIntentType.GET_SLEEP_LOG,
      get_training_load: VoiceIntentType.GET_TRAINING_LOAD,
      get_personal_records: VoiceIntentType.GET_PERSONAL_RECORDS,
      get_period_summary: VoiceIntentType.GET_PERIOD_SUMMARY,
      create_workout: VoiceIntentType.CREATE_WORKOUT,
      create_workout_plan: VoiceIntentType.CREATE_WORKOUT_PLAN,
      schedule_workout: VoiceIntentType.SCHEDULE_WORKOUT,
      log_sleep: VoiceIntentType.LOG_SLEEP,
    };

    return mapping[functionName] || VoiceIntentType.UNKNOWN;
  }

  private isWriteOperation(intent: VoiceIntentType): boolean {
    return [
      VoiceIntentType.CREATE_WORKOUT,
      VoiceIntentType.CREATE_WORKOUT_PLAN,
      VoiceIntentType.SCHEDULE_WORKOUT,
      VoiceIntentType.LOG_SLEEP,
    ].includes(intent);
  }

  private normalizeParameters(intent: VoiceIntentType, args: Record<string, unknown>): Record<string, unknown> {
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];

    // Handle relative date parsing for single date fields
    if (args.date && typeof args.date === 'string') {
      const dateLower = args.date.toLowerCase();
      if (dateLower === 'yesterday' || dateLower === 'last night') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        args.date = yesterday.toISOString().split('T')[0];
      } else if (dateLower === 'today') {
        args.date = todayISO;
      } else if (dateLower === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        args.date = tomorrow.toISOString().split('T')[0];
      } else if (dateLower.includes('days ago')) {
        const match = dateLower.match(/(\d+)\s*days?\s*ago/);
        if (match) {
          const daysAgo = Number.parseInt(match[1], 10);
          const date = new Date(today);
          date.setDate(date.getDate() - daysAgo);
          args.date = date.toISOString().split('T')[0];
        }
      }
    }

    // Map function args to our parameter structure
    switch (intent) {
      case VoiceIntentType.GET_FITNESS_FATIGUE:
      case VoiceIntentType.GET_VO2MAX_HISTORY: {
        const result: Record<string, unknown> = {};
        // Prefer explicit date range over days
        if (args.startDate) {
          result.startDate = args.startDate;
          result.endDate = args.endDate || todayISO;
        } else if (args.days) {
          result.days = args.days;
        } else {
          // Default to 7 days
          result.days = 7;
        }
        return result;
      }

      case VoiceIntentType.GET_SLEEP_LOG:
        return { date: args.date };

      case VoiceIntentType.GET_PERIOD_SUMMARY: {
        const result: Record<string, unknown> = {};

        // Map periodType to the API expected format or use custom dates
        if (args.periodType) {
          result.periodType = args.periodType;
        }

        // Handle date range - prefer explicit dates
        if (args.startDate) {
          result.startDate = args.startDate;
          result.endDate = args.endDate || todayISO;
        } else if (args.days && typeof args.days === 'number') {
          // Convert days to date range
          const startDate = new Date(today);
          startDate.setDate(startDate.getDate() - (args.days as number) + 1);
          result.startDate = startDate.toISOString().split('T')[0];
          result.endDate = todayISO;
        } else if (args.periodType === 'week') {
          // Default to this week (Monday to today)
          const dayOfWeek = today.getDay();
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const monday = new Date(today);
          monday.setDate(today.getDate() + mondayOffset);
          result.startDate = monday.toISOString().split('T')[0];
          result.endDate = todayISO;
        } else if (args.periodType === 'month') {
          // Default to this month
          const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          result.startDate = firstOfMonth.toISOString().split('T')[0];
          result.endDate = todayISO;
        } else {
          // Fallback to current week
          result.periodType = 'week';
          const dayOfWeek = today.getDay();
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const monday = new Date(today);
          monday.setDate(today.getDate() + mondayOffset);
          result.startDate = monday.toISOString().split('T')[0];
          result.endDate = todayISO;
        }

        return result;
      }

      case VoiceIntentType.CREATE_WORKOUT: {
        // New structure with items array
        const items = args.items as Array<{
          type: 'exercise' | 'superset' | 'step' | 'intervals';
          name?: string;
          exercises?: string[];
          repeat?: number;
          stepType?: string;
          durationMinutes?: number;
          description?: string;
          steps?: Array<{ stepType: string; durationMinutes: number; description?: string }>;
        }>;

        if (!items || items.length === 0) {
          // Fallback for old format
          const hasCardioSteps = Array.isArray(args.cardioSteps) && args.cardioSteps.length > 0;
          const hasExercises = Array.isArray(args.exercises) && args.exercises.length > 0;

          // Default to 'run' for cardio (most common) instead of generic 'cardio'
          const fallbackType = args.workoutType || args.type || (hasCardioSteps ? 'run' : 'strength');

          return {
            workoutName: args.name,
            exercises: hasExercises ? args.exercises : [],
            cardioSteps: hasCardioSteps ? args.cardioSteps : undefined,
            difficulty: args.difficulty,
            workoutType: fallbackType,
            isCardioWorkout: hasCardioSteps && !hasExercises,
          };
        }

        // Detect workout type based on items
        const hasCardioItems = items.some((item) => item.type === 'step' || item.type === 'intervals');
        const hasExerciseItems = items.some((item) => item.type === 'exercise' || item.type === 'superset');

        // Use the explicitly provided workoutType, or default based on content
        // Don't default to generic 'cardio' - prefer specific types like 'run', 'cycling', 'swimming'
        let detectedType = args.workoutType as string | undefined;
        if (!detectedType) {
          if (hasCardioItems && !hasExerciseItems) {
            // Default to 'run' for cardio if no specific type provided (most common cardio)
            detectedType = 'run';
          } else {
            detectedType = 'strength';
          }
        }

        return {
          workoutName: args.name,
          items: items,
          difficulty: args.difficulty,
          workoutType: detectedType,
          isCardioWorkout: hasCardioItems && !hasExerciseItems,
        };
      }

      case VoiceIntentType.CREATE_WORKOUT_PLAN:
        return {
          workoutName: args.name,
          planDetails: args.days || [],
        };

      case VoiceIntentType.SCHEDULE_WORKOUT:
        return {
          workoutName: args.workoutName,
          scheduleDate: args.date,
        };

      case VoiceIntentType.LOG_SLEEP: {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          date: args.date || yesterday.toISOString().split('T')[0],
          sleepHours: args.hours,
          sleepQuality: args.quality,
        };
      }

      default:
        return args;
    }
  }

  private getActionDescription(intent: VoiceIntentType, args: Record<string, unknown>): string {
    switch (intent) {
      case VoiceIntentType.GET_FITNESS_FATIGUE: {
        if (args.startDate && args.endDate) {
          return `Get fitness and fatigue data from ${args.startDate} to ${args.endDate}`;
        }
        return `Get fitness and fatigue data for the last ${args.days || 7} days`;
      }
      case VoiceIntentType.GET_VO2MAX_HISTORY: {
        if (args.startDate && args.endDate) {
          return `Get VO2 max history from ${args.startDate} to ${args.endDate}`;
        }
        return `Get VO2 max history for the last ${args.days || 90} days`;
      }
      case VoiceIntentType.GET_SLEEP_LOG:
        return `Get sleep data for ${args.date}`;
      case VoiceIntentType.GET_TRAINING_LOAD:
        return 'Get current training load analysis';
      case VoiceIntentType.GET_PERSONAL_RECORDS:
        return 'Get your personal records';
      case VoiceIntentType.GET_PERIOD_SUMMARY: {
        if (args.startDate && args.endDate) {
          return `Get training summary from ${args.startDate} to ${args.endDate}`;
        }
        if (args.days) {
          return `Get training summary for the last ${args.days} days`;
        }
        return `Get ${args.periodType || 'week'}ly training summary`;
      }
      case VoiceIntentType.CREATE_WORKOUT: {
        const hasItems = Array.isArray(args.items) && args.items.length > 0;
        const hasCardioSteps = Array.isArray(args.cardioSteps) && args.cardioSteps.length > 0;
        const hasExercises = Array.isArray(args.exercises) && args.exercises.length > 0;

        // Handle new items structure
        if (hasItems) {
          const items = args.items as Array<{
            type: 'exercise' | 'superset' | 'step' | 'intervals';
            name?: string;
            exercises?: string[];
            repeat?: number;
            stepType?: string;
            durationMinutes?: number;
            description?: string;
            steps?: Array<{ stepType: string; durationMinutes: number }>;
          }>;

          const descriptions: string[] = [];
          for (const item of items) {
            switch (item.type) {
              case 'exercise':
                if (item.name) descriptions.push(item.name);
                break;
              case 'superset':
                if (item.exercises && item.exercises.length > 0) {
                  const repeatCount = item.repeat || 3;
                  descriptions.push(`superset of ${item.exercises.join(', ')} (${repeatCount}x)`);
                }
                break;
              case 'step':
                if (item.stepType && item.durationMinutes) {
                  const desc = item.description ? `${item.description} ` : '';
                  descriptions.push(`${item.durationMinutes} minute ${desc}${item.stepType.replace('_', ' ')}`);
                }
                break;
              case 'intervals':
                if (item.steps && item.steps.length > 0) {
                  const repeatCount = item.repeat || 1;
                  const stepDescs = item.steps.map((s) => `${s.durationMinutes} min ${s.stepType.replace('_', ' ')}`);
                  descriptions.push(`${repeatCount} intervals of ${stepDescs.join(', ')}`);
                }
                break;
            }
          }

          if (descriptions.length > 0) {
            return `Create a workout with: ${descriptions.join(', ')}`;
          }
        }

        // Fallback to old cardioSteps format
        if (hasCardioSteps && !hasExercises) {
          const steps = args.cardioSteps as Array<{ stepType: string; durationMinutes: number; description?: string }>;
          const stepDescriptions = steps.map((s) => {
            const desc = s.description ? `${s.description} ` : '';
            return `${s.durationMinutes} minute ${desc}${s.stepType.replace('_', ' ')}`;
          });
          return `Create a workout with: ${stepDescriptions.join(', ')}`;
        }

        // Fallback to old exercises format
        if (hasExercises) {
          return `Create a workout with: ${(args.exercises as string[]).join(', ')}`;
        }

        return 'Create a new workout';
      }
      case VoiceIntentType.CREATE_WORKOUT_PLAN:
        return `Create a workout plan: ${args.name || 'New Plan'}`;
      case VoiceIntentType.SCHEDULE_WORKOUT:
        return `Schedule workout for ${args.date}`;
      case VoiceIntentType.LOG_SLEEP:
        return `Log ${args.hours} hours of sleep`;
      default:
        return 'Unknown action';
    }
  }

  private getBlockedReason(text: string): string {
    if (/delete|remove|erase/i.test(text)) {
      return 'Deleting items via voice is not allowed for safety. Please use the app directly to delete workouts, plans, or schedules.';
    }
    if (/password|email|account|settings/i.test(text)) {
      return 'Account settings cannot be changed via voice for security reasons. Please use the settings page.';
    }
    if (/start.*workout|begin.*session|live.*workout/i.test(text)) {
      return 'Starting live workouts via voice is not supported. Please use the workout screen to start a session.';
    }
    return 'This action is not available via voice assistant.';
  }

  private getSuggestionsForIntent(intent: VoiceIntentType): string[] {
    const suggestions: Record<VoiceIntentType, string[]> = {
      [VoiceIntentType.GET_FITNESS_FATIGUE]: ['Check VO2 max', 'Show personal records', 'View sleep data'],
      [VoiceIntentType.GET_VO2MAX_HISTORY]: ['Check fitness status', 'View training load', 'Show weekly summary'],
      [VoiceIntentType.GET_SLEEP_LOG]: ['Check last night sleep', 'View fitness status', 'Show this week'],
      [VoiceIntentType.GET_TRAINING_LOAD]: ['Check fatigue level', 'Show personal records', 'View sleep'],
      [VoiceIntentType.GET_PERSONAL_RECORDS]: ['Check fitness', 'View training load', 'Create workout'],
      [VoiceIntentType.GET_PERIOD_SUMMARY]: ['Show detailed fatigue', 'View personal records', 'Check sleep'],
      [VoiceIntentType.CREATE_WORKOUT]: ['Schedule it', 'Create plan', 'Check fitness'],
      [VoiceIntentType.CREATE_WORKOUT_PLAN]: ['Schedule workouts', 'View plan', 'Check fitness'],
      [VoiceIntentType.SCHEDULE_WORKOUT]: ['View calendar', 'Check training load', 'Create workout'],
      [VoiceIntentType.LOG_SLEEP]: ['Check fitness', 'View sleep history', 'Training status'],
      [VoiceIntentType.UNKNOWN]: ['Check fitness', 'Show personal records', 'View sleep data'],
      [VoiceIntentType.BLOCKED]: ['Check fitness', 'Show personal records', 'Create workout'],
      [VoiceIntentType.CLARIFICATION_NEEDED]: ['Check fitness', 'Show personal records', 'View sleep'],
    };

    return suggestions[intent] || ['Check fitness', 'Show personal records', 'View sleep data'];
  }

  private getFallbackResponse(intent: VoiceIntentType, data: Record<string, unknown>): string {
    switch (intent) {
      case VoiceIntentType.GET_FITNESS_FATIGUE:
        return `Your current fitness and fatigue data has been retrieved. ${data.currentForm ? `Your form is ${data.currentForm}.` : ''}`;
      case VoiceIntentType.GET_VO2MAX_HISTORY:
        return 'Your VO2 max history has been loaded.';
      case VoiceIntentType.GET_SLEEP_LOG:
        return `Your sleep data for the requested date is ready. ${data.totalDurationSeconds ? `You slept ${Math.round((data.totalDurationSeconds as number) / 3600)} hours.` : ''}`;
      case VoiceIntentType.CREATE_WORKOUT:
        return 'Your workout has been created successfully.';
      case VoiceIntentType.LOG_SLEEP:
        return 'Your sleep has been logged.';
      default:
        return 'Your request has been processed.';
    }
  }
}
