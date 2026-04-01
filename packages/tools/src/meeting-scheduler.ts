/**
 * Meeting scheduler tool — proposes meeting slots based on timezone and preferences.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

const dayOrder: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const weekdayLookup: Record<string, Weekday> = {
  monday: 'monday',
  tuesday: 'tuesday',
  wednesday: 'wednesday',
  thursday: 'thursday',
  friday: 'friday',
  saturday: 'saturday',
  sunday: 'sunday',
};

function getParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: Weekday;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  const weekdayRaw = get('weekday').toLowerCase();
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: weekdayLookup[weekdayRaw] ?? 'monday',
  };
}

function ymd(parts: { year: number; month: number; day: number }): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export const meetingSchedulerTool = new DynamicStructuredTool({
  name: 'propose_meeting_slots',
  description:
    'Proposes upcoming meeting slots based on timezone, preferred weekdays, and business-hour window. Useful for converting leads into scheduled calls.',
  schema: z.object({
    timezone: z
      .string()
      .default('UTC')
      .describe('IANA timezone string, for example America/New_York.'),
    durationMinutes: z
      .number()
      .int()
      .min(15)
      .max(120)
      .default(30)
      .describe('Meeting duration in minutes.'),
    preferredDays: z
      .array(
        z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
      )
      .min(1)
      .default(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
      .describe('Preferred weekdays for meetings.'),
    windowStartHour: z
      .number()
      .int()
      .min(0)
      .max(23)
      .default(10)
      .describe('Local start hour (24h format).'),
    windowEndHour: z
      .number()
      .int()
      .min(1)
      .max(24)
      .default(18)
      .describe('Local end hour (24h format, exclusive).'),
    slotsToReturn: z
      .number()
      .int()
      .min(1)
      .max(8)
      .default(3)
      .describe('How many candidate slots to return.'),
    earliestDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Optional earliest local date for scheduling in YYYY-MM-DD format.'),
  }),
  func: async ({
    timezone,
    durationMinutes,
    preferredDays,
    windowStartHour,
    windowEndHour,
    slotsToReturn,
    earliestDate,
  }: {
    timezone: string;
    durationMinutes: number;
    preferredDays: Weekday[];
    windowStartHour: number;
    windowEndHour: number;
    slotsToReturn: number;
    earliestDate?: string;
  }) => {
    if (windowEndHour <= windowStartHour) {
      return 'Error: windowEndHour must be greater than windowStartHour.';
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      return `Error: "${timezone}" is not a valid IANA timezone.`;
    }

    const preferred = new Set(preferredDays);
    const now = new Date();
    const cursor = new Date(now.getTime());
    cursor.setUTCMinutes(Math.ceil(cursor.getUTCMinutes() / 30) * 30, 0, 0);

    const maxWindowDays = 21;
    const maxIterations = maxWindowDays * 24 * 2;
    const slots: Date[] = [];

    for (let i = 0; i < maxIterations && slots.length < slotsToReturn; i += 1) {
      const local = getParts(cursor, timezone);
      const localDate = ymd(local);

      const inDay = preferred.has(local.weekday);
      const inDate = !earliestDate || localDate >= earliestDate;
      const minuteIsBoundary = local.minute === 0 || local.minute === 30;
      const withinHours =
        local.hour >= windowStartHour &&
        (local.hour < windowEndHour || (local.hour === windowEndHour && local.minute === 0));

      // Keep the full meeting inside the scheduling window.
      const meetingEndMinutes = local.hour * 60 + local.minute + durationMinutes;
      const windowEndMinutes = windowEndHour * 60;

      if (inDay && inDate && minuteIsBoundary && withinHours && meetingEndMinutes <= windowEndMinutes) {
        slots.push(new Date(cursor));
      }

      cursor.setUTCMinutes(cursor.getUTCMinutes() + 30);
    }

    if (slots.length === 0) {
      return 'No matching meeting slots found in the next 21 days. Try broader days or wider hours.';
    }

    const localFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      dateStyle: 'full',
      timeStyle: 'short',
    });

    const slotLines = slots.map((slot, index) => {
      const localValue = localFormatter.format(slot);
      return `${index + 1}. ${localValue} (${timezone}) | UTC ${slot.toISOString()}`;
    });

    return [
      `Suggested ${durationMinutes}-minute meeting slot(s):`,
      ...slotLines,
      `Preferred days: ${dayOrder.filter((day) => preferred.has(day)).join(', ')}`,
      `Window: ${String(windowStartHour).padStart(2, '0')}:00-${String(windowEndHour).padStart(2, '0')}:00 (${timezone})`,
    ].join('\n');
  },
});