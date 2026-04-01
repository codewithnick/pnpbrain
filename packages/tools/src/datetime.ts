/**
 * Datetime tool — returns the current date and time in a requested timezone.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export const datetimeTool = new DynamicStructuredTool({
  name: 'get_datetime',
  description:
    'Returns the current date and time. ' +
    'Optionally accepts an IANA timezone string (e.g. "America/New_York").',
  schema: z.object({
    timezone: z
      .string()
      .optional()
      .describe('IANA timezone string, e.g. "America/New_York". Defaults to UTC.'),
  }),
  func: async ({ timezone }: { timezone?: string }) => {
    const tz = timezone ?? 'UTC';
    try {
      const now = new Date();
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        dateStyle: 'full',
        timeStyle: 'long',
      }).format(now);
      return `Current date and time (${tz}): ${formatted}`;
    } catch {
      return `Error: "${tz}" is not a valid IANA timezone string.`;
    }
  },
});
