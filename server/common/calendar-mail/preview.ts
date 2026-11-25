import { previewCalendarMail } from './calendar-mail';
import { calendarMailConfig } from './config';

// Sample values let developers inspect the payload without sending an email.
previewCalendarMail({
  from: calendarMailConfig().from || 'sender@gmail.com',
  to: ['test@gmail.com', 'test1@gmail.com'],
  cc: ['example@gmail.com', 'test@gmail.com'],
  bcc: ['example@gmail.com', 'test@gmail.com'],
  subject: 'NEW MAIL',
  text: 'text',
  startTime: '2025-08-08T10:00:00Z',
  endTime: '2025-08-08T11:00:00Z',
  location: 'conference room a',
});
