/** The external API's requested payload. The unusual endTIme spelling matches its example. */
export interface CalendarMail {
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  html: string;
  calendarEvent: {
    startTime: string;
    endTIme: string;
    location: string;
  };
}

export interface CalendarMailInput {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  startTime: string;
  endTime: string;
  location: string;
}

// Meeting details are user-provided and must not become executable HTML in email clients.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

/** Build the email body separately so the eventual API transport can reuse it. */
export function buildCalendarMail(input: CalendarMailInput): CalendarMail {
  return {
    from: input.from,
    to: input.to.join(', '),
    cc: (input.cc ?? []).join(', '),
    bcc: (input.bcc ?? []).join(', '),
    subject: input.subject,
    text: input.text,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;color:#0d1b2a"><div style="font-weight:bold;font-size:22px" dir="ltr"><svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 60 60" style="vertical-align:middle" aria-hidden="true"><path d="M5 38C2 32 11 23 25 18S51 13 55 19" fill="none" stroke="#0d1b2a" stroke-width="1.4" opacity="0.45"/><path fill="#0d1b2a" opacity="0.65" d="M18 20 29 15v29l-11 3z"/><path fill="#0d1b2a" d="M29 15 41 19v27l-12-2z"/><path d="M5 38c4 6 17 5 31 0s22-13 19-19" fill="none" stroke="#0d1b2a" stroke-width="1.6"/><g transform="translate(43 34) rotate(52)" fill="#0d1b2a"><path d="M0-9C3-7 4-3 4 1L2 5H-2L-4 1C-4-3-3-7 0-9Z"/><path d="M-4 0-7 4-3 3M4 0l3 4-4-1" opacity="0.7"/><circle cy="-3" r="1.4" fill="#415a77"/></g></svg> My-Space</div><h2>${escapeHtml(input.subject)}</h2><p style="white-space:pre-wrap">${escapeHtml(input.text)}</p><p>${escapeHtml(input.location)}</p></div>`,
    calendarEvent: {
      startTime: input.startTime,
      endTIme: input.endTime,
      location: input.location,
    },
  };
}

/** Preview only: no network request or API key is used until the transport is implemented. */
export function previewCalendarMail(input: CalendarMailInput): void {
  console.log('[calendar-mail preview]', JSON.stringify(buildCalendarMail(input), null, 2));
}
