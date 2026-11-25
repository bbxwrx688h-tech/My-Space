const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildCalendarMail } = require('../dist/server/common/calendar-mail/calendar-mail');

test('calendar email preview follows the external payload format and escapes meeting details', () => {
  const result = buildCalendarMail({
    from: 'sender@example.com',
    to: ['one@example.com', 'two@example.com'],
    subject: '<meeting>',
    text: 'Hello & welcome',
    startTime: '2025-08-08T10:00:00Z',
    endTime: '2025-08-08T11:00:00Z',
    location: 'MID',
  });
  assert.equal(result.to, 'one@example.com, two@example.com');
  assert.equal(result.cc, '');
  assert.equal(result.bcc, '');
  assert.deepEqual(result.calendarEvent, {
    startTime: '2025-08-08T10:00:00Z',
    endTIme: '2025-08-08T11:00:00Z',
    location: 'MID',
  });
  assert.match(result.html, /&lt;meeting&gt;/);
  assert.match(result.html, /Hello &amp; welcome/);
  assert.doesNotMatch(result.html, /<meeting>/);
});

test('calendar mail configuration reads injected environment values without requiring a file', () => {
  const { calendarMailConfig } = require('../dist/server/common/calendar-mail/config');
  assert.deepEqual(
    calendarMailConfig({
      CALENDAR_MAIL_API_URL: 'https://mail.example.test/',
      CALENDAR_MAIL_API_KEY: 'test-secret',
      CALENDAR_MAIL_FROM: 'sender@example.test',
    }),
    {
      endpoint: 'https://mail.example.test/Mail/send/calender',
      apiKey: 'test-secret',
      from: 'sender@example.test',
    },
  );
  assert.deepEqual(calendarMailConfig({}), {
    endpoint: undefined,
    apiKey: undefined,
    from: undefined,
  });
});
