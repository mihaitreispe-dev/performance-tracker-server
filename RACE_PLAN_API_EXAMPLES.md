# Race Plan API - Usage Examples

## Prerequisites

1. User must have an account and be authenticated
2. Race must be registered in the system (`athlete_races` table)
3. Prediction must exist for the race (call prediction endpoint first)
4. For weather integration, race must have location data

## Step-by-Step Flow

### 1. Register a Race (if not done)

```http
POST /v1/users/me/races
Content-Type: application/json
Authorization: Bearer {token}

{
  "race_event_id": "uuid-of-race-event",  // Optional: links to race_events with location
  "manual_name": "Boston Marathon 2024",  // Or from race_event
  "manual_date": "2024-04-15",
  "manual_event_type": "run",
  "manual_distance_meters": 42195,
  "goal_time_seconds": 10800,  // 3:00:00
  "priority": "A"
}
```

### 2. Generate Prediction

```http
POST /v1/users/me/races/{raceId}/prediction
Content-Type: application/json
Authorization: Bearer {token}

{
  "sport": "run",
  "distance_meters": 42195
}
```

**Response includes:**
- `predicted_time_seconds` - e.g., 10650 (2:57:30)
- `confidence_score` - e.g., 0.85
- `target_pace_per_km` - e.g., 252 (4:12/km)

### 3. Generate Race Plan

```http
POST /v1/users/me/races/{raceId}/plan
Content-Type: application/json
Authorization: Bearer {token}

{
  "pacing_strategy": "negative_split",
  "force_refresh": false
}
```

**Response Example:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "athlete_race_id": "race-uuid",
  "race_prediction_id": "prediction-uuid",
  "predicted_finish_time_seconds": 10650,
  "target_finish_time_seconds": 10800,
  "pacing_strategy": "negative_split",
  "negative_split_ratio": 1.051,

  "segment_splits": [
    {
      "segment_number": 1,
      "start_distance_meters": 0,
      "end_distance_meters": 1000,
      "distance_meters": 1000,
      "elevation_gain_meters": 5,
      "elevation_loss_meters": 0,
      "average_grade_percent": 0.5,
      "adjusted_pace_seconds_per_km": 260,
      "segment_time_seconds": 260,
      "cumulative_time_seconds": 260
    },
    // ... 41 more segments for marathon
  ],

  "effort_zones": [
    {
      "segment_number": 1,
      "zone_name": "Warmup",
      "target_hr_min": 108,
      "target_hr_max": 126,
      "target_pace_min_seconds_per_km": 254,
      "target_pace_max_seconds_per_km": 266,
      "rpe_scale": 3,
      "description": "Easy start, find your rhythm, settle into race pace gradually"
    },
    {
      "segment_number": 10,
      "zone_name": "Race Pace",
      "target_hr_min": 147,
      "target_hr_max": 158,
      "target_pace_min_seconds_per_km": 247,
      "target_pace_max_seconds_per_km": 257,
      "rpe_scale": 5,
      "description": "Steady race pace, sustainable effort"
    }
  ],

  "energy_management": {
    "carb_loading_days_before": 2,
    "race_morning_carbs_grams": 80,
    "race_morning_timing_hours_before": 3,
    "on_course_nutrition": [
      {
        "time_elapsed_minutes": 30,
        "distance_km": 7.1,
        "carbs_grams": 30,
        "hydration_ml": 250,
        "notes": "Start nutrition early"
      },
      {
        "time_elapsed_minutes": 60,
        "distance_km": 14.1,
        "carbs_grams": 30,
        "hydration_ml": 250
      },
      {
        "time_elapsed_minutes": 90,
        "distance_km": 21.2,
        "carbs_grams": 30,
        "hydration_ml": 250
      }
    ],
    "total_carbs_per_hour": 60,
    "total_hydration_ml_per_hour": 575,
    "caffeine_strategy": {
      "pre_race_mg": 200,
      "pre_race_timing_minutes": 45,
      "on_course_mg": 100,
      "on_course_timing_minutes": 90
    }
  },

  "fatigue_model": {
    "baseline_fade_factor": 1.03,
    "critical_fatigue_point_km": 31.6,
    "mental_checkpoints": [
      {
        "distance_km": 10.5,
        "percentage_complete": 25,
        "message": "First Quarter Complete",
        "advice": "Stay relaxed and patient. Save your energy for the second half."
      },
      {
        "distance_km": 21.1,
        "percentage_complete": 50,
        "message": "Halfway There!",
        "advice": "Check in with your body. Adjust effort if needed. The real race starts now."
      },
      {
        "distance_km": 31.6,
        "percentage_complete": 75,
        "message": "Three Quarters Done",
        "advice": "This is where champions are made. Dig deep and stay strong."
      },
      {
        "distance_km": 37.9,
        "percentage_complete": 90,
        "message": "Final Push - Almost There!",
        "advice": "Leave nothing on the course. Give it everything you have."
      }
    ],
    "pacing_guidance": "Start conservatively, build gradually, and finish strong..."
  },

  "weather": {
    "temperature_celsius": 18,
    "humidity_percent": 65,
    "wind_speed_kmh": 12,
    "conditions": "partly cloudy",
    "adjustments": {
      "temperature_impact_seconds": 180,
      "humidity_impact_seconds": 45,
      "wind_impact_seconds": 30,
      "total_impact_seconds": 255,
      "total_impact_percent": 2.4,
      "heat_stress_level": "low",
      "hydration_multiplier": 1.15,
      "pacing_advice": "Moderate impact expected: Start conservatively, adjust pace based on feel. Stay hydrated.",
      "risk_warnings": []
    }
  },

  "warmup_protocol": "60 minutes before start: Light 10-minute jog, dynamic stretches (leg swings, lunges), 3-4 strides building to race pace. Use bathroom 20 minutes before start.",

  "race_day_checklist": [
    "Lay out race outfit and bib the night before",
    "Set multiple alarms (phone + backup)",
    "Eat breakfast 3 hours before race start",
    "Arrive at venue 60-90 minutes early",
    "Use porta-potty before warmup",
    "Complete warmup protocol 30-45 min before start",
    "Get to correct starting corral 10 minutes before gun",
    "Start watch/GPS when you cross start line"
  ],

  "key_advice": [
    "First mile should feel ridiculously easy - you will thank yourself later",
    "Focus on even effort, not even pace - especially on hills",
    "Start taking nutrition early (30 min in), do not wait until you feel hungry",
    "Resist urge to go out fast - second half is where you make up time",
    "When it gets hard, remember why you trained - you are ready for this"
  ],

  "status": "active",
  "plan_version": 1,
  "created_at": "2024-03-24T10:00:00Z",
  "updated_at": "2024-03-24T10:00:00Z"
}
```

### 4. Get Existing Plan

```http
GET /v1/users/me/races/{raceId}/plan
Authorization: Bearer {token}
```

Returns the active race plan (same structure as above).

**Error if no plan exists:**
```json
{
  "statusCode": 404,
  "message": "No active race plan found. Generate a plan first."
}
```

### 5. Refresh Weather

As race day approaches, weather forecasts become more accurate. Force a refresh:

```http
PATCH /v1/users/me/races/{raceId}/plan/refresh-weather
Authorization: Bearer {token}
```

**What happens:**
1. Fetches latest weather forecast from OpenWeather
2. Compares with previous forecast
3. If significant change detected (>5°C, >20% humidity, >15km/h wind):
   - Recalculates performance adjustments
   - Regenerates race plan with new pacing
   - Updates hydration recommendations
   - Supersedes old plan (status = 'superseded')
   - Creates new plan version
4. Returns updated plan

## Pacing Strategy Options

### 1. Even Pace (Default)
```json
{ "pacing_strategy": "even" }
```
- Equal effort throughout (grade-adjusted)
- Uses Minetti model for hill adjustments
- Best for: Most runners, predictable courses

### 2. Negative Split
```json
{ "pacing_strategy": "negative_split" }
```
- First half: 2.5% slower
- Second half: 2.5% faster
- Best for: Experienced runners, flat courses, hot weather

### 3. Conservative Start
```json
{ "pacing_strategy": "conservative" }
```
- First 20%: 5% slower (warmup)
- Middle 60%: target pace
- Final 20%: push (2% faster)
- Best for: First-time distance, uncertain fitness, hilly courses

### 4. Progressive Build
```json
{ "pacing_strategy": "progressive" }
```
- Gradual acceleration throughout
- Linear progression from 5% slow to 5% fast
- Best for: Well-trained athletes, time trials

## Weather Impact Examples

### Hot Day (28°C, 70% humidity)
```json
{
  "temperature_impact_seconds": 480,     // ~8 minutes slower
  "humidity_impact_seconds": 120,        // ~2 minutes slower
  "total_impact_percent": 5.6,           // 5.6% slower
  "heat_stress_level": "moderate",
  "hydration_multiplier": 1.5,           // 50% more fluids
  "pacing_advice": "Challenging conditions: Adjust goal pace by 5-10 sec/km..."
}
```

### Cool Perfect Day (12°C, 45% humidity)
```json
{
  "total_impact_seconds": -30,           // 30 seconds faster!
  "total_impact_percent": -0.5,
  "heat_stress_level": "none",
  "hydration_multiplier": 1.0,
  "pacing_advice": "Favorable conditions for racing! Perfect weather for a PR attempt."
}
```

### Windy Day (20km/h headwind)
```json
{
  "wind_impact_seconds": 360,            // ~6 minutes slower
  "total_impact_percent": 3.4,
  "risk_warnings": [
    "Strong winds: Adjust pacing for headwind sections. Be cautious of dehydration from wind."
  ]
}
```

## Automatic Updates (Cron)

The system automatically checks weather daily at 6:00 AM for races in next 7 days:

**Day 7 before race:**
- Checks every 24 hours
- Low confidence forecast
- Plans may change significantly

**Day 3 before race:**
- Checks every 12 hours
- Medium confidence
- Forecast stabilizing

**Day 1 before race:**
- Checks every 4 hours
- High confidence
- Final adjustments only

**Example automatic update log:**
```
[6:00 AM] Starting daily weather refresh for upcoming races
[6:00 AM] Found 5 active race plans to check
[6:01 AM] Refreshing weather for race abc-123 (Boston Marathon)
[6:01 AM] Significant weather change detected for race abc-123, regenerating plan
[6:02 AM] Race plan regenerated for user xyz-789, race abc-123
[6:02 AM] Weather refresh completed: 5 forecasts refreshed, 1 plan regenerated, 0 errors
```

## Error Handling

### No Prediction Exists
```json
{
  "statusCode": 404,
  "message": "No prediction found for this race. Generate a prediction first."
}
```

### Weather API Unavailable
- Plan generates without weather data
- Sets `weather: null` in response
- All other features work normally
- Can add weather later via refresh endpoint

### Invalid Pacing Strategy
```json
{
  "statusCode": 400,
  "message": "Invalid pacing_strategy. Must be one of: even, negative_split, conservative, progressive"
}
```

## Tips for Best Results

1. **Generate prediction first** - Plan quality depends on prediction accuracy
2. **Upload GPX file** - Course-based plans are more accurate than flat estimates
3. **Set LTHR** - Enables heart rate zone targeting in effort zones
4. **Refresh 1-2 days before race** - Most accurate weather forecasts
5. **Review mental checkpoints** - Program your race execution visualizations

## Integration with Client

### React Query Hook Example
```typescript
import { useRacePlan, useGenerateRacePlan } from '@/hooks/api/useRacePlan';

function RacePlanView({ raceId }: { raceId: string }) {
  const { data: plan, isLoading } = useRacePlan('me', raceId);
  const generatePlan = useGenerateRacePlan();

  const handleGenerate = () => {
    generatePlan.mutate({
      userId: 'me',
      raceId,
      options: { pacing_strategy: 'negative_split' }
    });
  };

  if (isLoading) return <LoadingSpinner />;
  if (!plan) return <GeneratePlanButton onClick={handleGenerate} />;

  return <RacePlanCard plan={plan} />;
}
```

## Next Steps

1. Test API with Postman/curl
2. Verify weather integration works
3. Test each pacing strategy
4. Check cron job execution
5. Build client UI components
