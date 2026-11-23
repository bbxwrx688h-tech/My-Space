import { DateTime } from 'luxon';
export const zone = 'Asia/Jerusalem';
export const local = (value: string) => DateTime.fromISO(value, { zone }).setLocale('he');
export const now = () => DateTime.now().setZone(zone).setLocale('he');
export const shortDate = (value: string) => local(value).toFormat('dd/MM/yy');
export const clock = (value: string) => local(value).toFormat('HH:mm');
// Meeting times use 24:00 for midnight at the end of the selected day.
export const endClock = (start: string, end: string) =>
  local(start).toISODate() !== local(end).toISODate() && clock(end) === '00:00'
    ? '24:00'
    : clock(end);
export const fullDate = (value: string) => local(value).toFormat('cccc, dd/MM/yy');
export const sunday = () =>
  now()
    .startOf('day')
    .minus({ days: now().weekday % 7 });

// Round up in Jerusalem time so opening a form late in the day still
// offers a future slot. Friday and Saturday roll forward to Sunday.
export function nextMeetingSlot(selectedDate?: string) {
  const current = now();
  let day = selectedDate && selectedDate > current.toISODate()! ? local(selectedDate) : current;
  let minutes = day.hasSame(current, 'day')
    ? (Math.floor((current.hour * 60 + current.minute) / 15) + 1) * 15
    : 9 * 60;
  if (minutes >= 1440) {
    day = day.plus({ days: 1 });
    minutes = 9 * 60;
  }
  while ([5, 6].includes(day.weekday)) {
    day = day.plus({ days: 1 });
    minutes = 9 * 60;
  }
  function format(total: number) {
    return (
      String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0')
    );
  }
  return {
    date: day.toISODate()!,
    from: format(minutes),
    until: format(Math.min(1440, minutes + 60)),
  };
}
