/**
 * Meeting booking tool — books meetings in connected providers (Google / Zoom)
 * or returns a scheduling link handoff for Calendly.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export interface MeetingIntegrationConfig {
  provider: string;
  /** OAuth access token (Google or Zoom). */
  accessToken?: string;
  /** OAuth refresh token — used to get a fresh access token when expired. */
  refreshToken?: string;
  /** ISO expiry timestamp for the access token. */
  tokenExpiresAt?: string;
  /** Provider-specific settings. */
  config?: {
    calendarId?: string;
    timezone?: string;
    /** Calendly self-serve scheduling URL. */
    schedulingUrl?: string;
    [key: string]: unknown;
  };
}

interface CreateMeetingBookingToolOptions {
  businessName: string;
  integration: MeetingIntegrationConfig;
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function isTokenFresh(expiresAt: string | undefined): boolean {
  if (!expiresAt) return true;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return true;
  return ts - Date.now() > 60_000;
}

async function getGoogleAccessToken(integration: MeetingIntegrationConfig): Promise<string | null> {
  if (integration.accessToken && isTokenFresh(integration.tokenExpiresAt)) {
    return integration.accessToken;
  }

  if (!integration.refreshToken) {
    return integration.accessToken ?? null;
  }

  const clientId = process.env['GOOGLE_OAUTH_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_OAUTH_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    return integration.accessToken ?? null;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    return integration.accessToken ?? null;
  }

  const payload = (await response.json()) as { access_token?: string };
  return payload.access_token ?? integration.accessToken ?? null;
}

async function getZoomAccessToken(integration: MeetingIntegrationConfig): Promise<string | null> {
  if (integration.accessToken && isTokenFresh(integration.tokenExpiresAt)) {
    return integration.accessToken;
  }

  if (!integration.refreshToken) {
    return integration.accessToken ?? null;
  }

  const clientId = process.env['ZOOM_OAUTH_CLIENT_ID'];
  const clientSecret = process.env['ZOOM_OAUTH_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    return integration.accessToken ?? null;
  }

  const tokenUrl = new URL('https://zoom.us/oauth/token');
  tokenUrl.searchParams.set('grant_type', 'refresh_token');
  tokenUrl.searchParams.set('refresh_token', integration.refreshToken);

  const response = await fetch(tokenUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
  });

  if (!response.ok) {
    return integration.accessToken ?? null;
  }

  const payload = (await response.json()) as { access_token?: string };
  return payload.access_token ?? integration.accessToken ?? null;
}

export function createMeetingBookingTool({
  businessName,
  integration,
}: CreateMeetingBookingToolOptions): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'book_company_meeting',
    description:
      'Books a meeting with the company using the connected provider (Google Calendar, Zoom) or returns a Calendly booking link.',
    schema: z.object({
      customerName: z.string().min(1).max(80),
      customerEmail: z.string().email(),
      startUtcIso: z.string().datetime().describe('Meeting start time in UTC ISO format.'),
      durationMinutes: z.number().int().min(15).max(120).default(30),
      agenda: z.string().max(300).optional(),
    }),
    func: async ({
      customerName,
      customerEmail,
      startUtcIso,
      durationMinutes,
      agenda,
    }: {
      customerName: string;
      customerEmail: string;
      startUtcIso: string;
      durationMinutes: number;
      agenda?: string;
    }) => {
      const title = `Discovery call: ${customerName}`;
      const description = agenda?.trim() || `Sales discovery meeting with ${customerName} (${customerEmail}).`;
      const endUtcIso = addMinutes(startUtcIso, durationMinutes);

      if (integration.provider === 'none') {
        return 'Meeting provider is not connected for this business. Ask the business owner to configure Google, Zoom, or Calendly in the Skills tab.';
      }

      if (integration.provider === 'google') {
        const googleAccessToken = await getGoogleAccessToken(integration);
        if (!googleAccessToken) {
          return 'Google Calendar is selected but access token is missing in Skills settings.';
        }

        const calendarId = integration.config?.calendarId || 'primary';
        const timezone = integration.config?.timezone || 'UTC';
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: title,
              description,
              start: { dateTime: startUtcIso, timeZone: timezone },
              end: { dateTime: endUtcIso, timeZone: timezone },
              attendees: [{ email: customerEmail, displayName: customerName }],
              conferenceData: {
                createRequest: {
                  requestId: `gcfis-${Date.now()}`,
                  conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
              },
            }),
          }
        );

        if (!response.ok) {
          const bodyText = await response.text();
          return `Google Calendar booking failed (${response.status}): ${bodyText.slice(0, 250)}`;
        }

        const payload = (await response.json()) as {
          id?: string;
          htmlLink?: string;
          hangoutLink?: string;
        };

        return [
          `Meeting booked in Google Calendar for ${customerName}.`,
          payload.hangoutLink ? `Meet link: ${payload.hangoutLink}` : null,
          payload.htmlLink ? `Event link: ${payload.htmlLink}` : null,
          payload.id ? `Event ID: ${payload.id}` : null,
        ]
          .filter(Boolean)
          .join('\n');
      }

      if (integration.provider === 'zoom') {
        const zoomAccessToken = await getZoomAccessToken(integration);
        if (!zoomAccessToken) {
          return 'Zoom is selected but access token is missing in Skills settings.';
        }

        const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${zoomAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            topic: `${businessName} discovery call`,
            type: 2,
            start_time: startUtcIso,
            duration: durationMinutes,
            timezone: integration.config?.timezone || 'UTC',
            agenda: description,
            settings: {
              join_before_host: false,
              waiting_room: true,
            },
          }),
        });

        if (!response.ok) {
          const bodyText = await response.text();
          return `Zoom booking failed (${response.status}): ${bodyText.slice(0, 250)}`;
        }

        const payload = (await response.json()) as {
          id?: number;
          join_url?: string;
          start_url?: string;
        };

        return [
          `Meeting booked in Zoom for ${customerName}.`,
          payload.join_url ? `Join link: ${payload.join_url}` : null,
          payload.start_url ? `Host link: ${payload.start_url}` : null,
          payload.id ? `Meeting ID: ${payload.id}` : null,
        ]
          .filter(Boolean)
          .join('\n');
      }

      const calendlyUrl = integration.config?.schedulingUrl?.trim();
      if (!calendlyUrl) {
        return 'Calendly is selected but scheduling URL is missing in Integrations settings.';
      }

      return [
        'Calendly is connected. Ask the customer to confirm using this booking link:',
        calendlyUrl,
      ].join('\n');
    },
  });
}
