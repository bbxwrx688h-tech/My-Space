const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const { testDatabase } = require('./database.cjs');

let app, pool, cleanup, admin, noa, uri, tamar, roomId;
let testSequence = 0;
const zone = 'Asia/Jerusalem';
const nextSunday = DateTime.now()
  .setZone(zone)
  .plus({ weeks: 1 })
  .startOf('week')
  .plus({ days: 6 });
const day = nextSunday.toISODate();
async function request(person, method, path, body, status = method === 'GET' ? 200 : 201) {
  const res = await app.inject({
    method,
    url: '/api/' + path,
    headers: { cookie: person?.cookie || '', 'x-my-space': '1' },
    payload: body,
  });
  assert.equal(res.statusCode, status, path + ' ' + res.body);
  return res.json();
}
async function login(path, body) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/' + path,
    remoteAddress: `192.0.2.${testSequence}`,
    headers: { 'x-my-space': '1' },
    payload: body,
  });
  assert.equal(res.statusCode, 201, res.body);
  const person = { cookie: res.headers['set-cookie'].split(';')[0] };
  person.id = (await request(person, 'GET', 'workspace')).me.id;
  return person;
}
const role = (person, role) => request(admin, 'POST', 'admin/role', { personId: person.id, role });
const workspace = (person) => request(person, 'GET', 'workspace');
const station = { site: 'MID', room: '204', os: 'Linux', description: 'השולחן ליד החלון' };
const publish = (person, stationId, start, end, status) =>
  request(person, 'POST', 'stations/offers', { stationId, start, end, note: 'מסך נוסף' }, status);
const days = (person, action, offerId, dates, status) =>
  request(person, 'POST', 'stations/days', { action, offerId, days: dates }, status);
const create = (from, until, title = 'ישיבת צוות') => ({
  action: 'create',
  roomId,
  date: day,
  from,
  until,
  title,
  description: 'עדכון שבועי',
});
const meeting = (person, change, status, token) =>
  request(person, 'POST', 'meetings', { change, token }, status);
const schedule = () => request(noa, 'GET', 'meetings?room=' + roomId + '&start=' + day);

before(async () => {
  cleanup = await testDatabase();
  ({ pool } = require('../dist/server/db/connection'));
  app = await require('../dist/server/main').buildApp(true);
});
beforeEach(async () => {
  testSequence++;
  // The pool is scoped to this suite's randomly named schema. Reset fixtures
  // so a single named test can also run independently.
  await pool.query('TRUNCATE people RESTART IDENTITY CASCADE');
  await require('../dist/server/db/migrate').migrate();
  admin = await login('admin', { username: 'admin', password: 'local-test-password' });
  [noa, uri, tamar] = await Promise.all(
    ['noa', 'uri', 'tamar'].map((n) => login('dev', { upn: n + '@example.test' })),
  );
  roomId = (await workspace(noa)).rooms[0].id;
});
after(async () => {
  if (app) await app.close();
  if (pool) await pool.end();
  if (cleanup) await cleanup();
});

test('login, isolated AD FS adapter, manual roles, and onboarding with or without a workstation', async () => {
  await request(null, 'GET', 'workspace', undefined, 401);
  await request(null, 'POST', 'auth/admin', { username: 'admin', password: 'incorrect' }, 401);
  await request(null, 'POST', 'auth/adfs', {}, 503);
  await request(noa, 'GET', 'admin/users', undefined, 403);
  await request(noa, 'POST', 'admin/role', { personId: noa.id, role: 'boss' }, 403);
  await request(admin, 'POST', 'admin/role', { personId: admin.id, role: 'boss' }, 404);
  await request(noa, 'POST', 'onboarding', { site: 'MID', station });
  await request(noa, 'POST', 'onboarding', { site: 'MID', station }, 409);
  for (const p of [uri, tamar, admin]) await request(p, 'POST', 'onboarding', { site: 'MBT' });
  assert.equal((await workspace(uri)).stations.length, 0);
  assert.equal((await workspace(noa)).stations.length, 1);
  const { resolveIdentity } = require('../dist/server/auth/identity');
  const identity = await resolveIdentity('adfs', {
    UPN: 'FIRST@example.test',
    name: 'יעל',
    surname: 'רבין',
  });
  assert.equal(
    identity,
    await resolveIdentity('adfs', { UPN: 'first@example.test', name: 'יעל', surname: 'כהן' }),
  );
  assert.ok(
    (await request(admin, 'GET', 'admin/users')).some(
      (p) => p.id === identity && p.surname === 'כהן',
    ),
  );
  const old = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.deepEqual((await request(null, 'GET', 'auth/options')).employees, []);
    await request(null, 'POST', 'auth/dev', { upn: 'noa@example.test' }, 404);
    await request(noa, 'GET', 'workspace', undefined, 401);
  } finally {
    process.env.NODE_ENV = old;
  }
});

test('station offers support partial weeks, separate computers in one room, weekends, release and withdrawal', async () => {
  const first = (await request(noa, 'POST', 'stations', station)).id;
  const second = (await request(noa, 'POST', 'stations', station)).id;
  const dates = Array.from({ length: 7 }, (_, i) => nextSunday.plus({ days: i }).toISODate());
  const a = (await publish(noa, first, day, dates[6])).id;
  const b = (await publish(noa, second, day, dates[6])).id;
  await publish(noa, first, day, day, 409);
  await publish(uri, first, day, day, 403);
  await days(uri, 'book', a, [dates[0], dates[2], dates[5]]);
  await days(uri, 'book', b, [dates[0], dates[1]], 409);
  await days(tamar, 'book', a, [dates[1], dates[6]]);
  await days(tamar, 'release', a, [dates[0]], 403);
  await days(tamar, 'withdraw', a, [dates[0]], 403);
  await days(uri, 'release', a, [dates[2]]);
  await days(tamar, 'book', a, [dates[2]]);
  await days(noa, 'withdraw', a, [dates[0], dates[3]]);
  const state = await workspace(uri);
  assert.ok(state.notices.some((n) => n.message.includes('204')));
  assert.deepEqual(
    state.offers
      .find((o) => o.id === a)
      .days.filter((d) => d.status === 'mine')
      .map((d) => d.date),
    [dates[5]],
  );
  assert.equal(state.offers.find((o) => o.id === b).days[1].status, 'available');
  await request(uri, 'POST', 'notices/read', { through: state.notices[0].id });
  assert.ok((await workspace(uri)).notices.every((n) => n.seen));
  await days(noa, 'withdraw', b, dates);
  assert.ok(!(await workspace(noa)).offers.some((o) => o.id === b));
});

test('concurrent station requests enforce station/day and employee/day uniqueness', async () => {
  const stations = await Promise.all(
    [station, { ...station, site: 'MARP' }].map((s) => request(noa, 'POST', 'stations', s)),
  );
  const raceDay = nextSunday.plus({ days: 14 }).toISODate();
  const a = (await publish(noa, stations[0].id, raceDay, raceDay)).id;
  const b = (await publish(noa, stations[1].id, raceDay, raceDay)).id;
  async function book(person, offerId) {
    return (
      await app.inject({
        method: 'POST',
        url: '/api/stations/days',
        headers: { cookie: person.cookie, 'x-my-space': '1' },
        payload: { action: 'book', offerId, days: [raceDay] },
      })
    ).statusCode;
  }
  const winners = await Promise.all([book(uri, a), book(tamar, a)]);
  assert.deepEqual([...winners].sort(), [201, 409]);
  await days(winners[0] === 201 ? uri : tamar, 'release', a, [raceDay]);
  assert.deepEqual((await Promise.all([book(uri, a), book(uri, b)])).sort(), [201, 409]);
});

test('calendar validation, concurrent creates, adjacent times and stale edits follow new roles', async () => {
  await role(uri, 'boss');
  await role(noa, 'manager');
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id });
  await meeting(tamar, create('07:00', '07:30'), 403);
  const cmd = create('08:00', '08:30');
  const race = await Promise.all(
    [uri, noa].map((p) =>
      app.inject({
        method: 'POST',
        url: '/api/meetings',
        headers: { cookie: p.cookie, 'x-my-space': '1' },
        payload: { change: cmd },
      }),
    ),
  );
  assert.deepEqual(race.map((r) => r.statusCode).sort(), [201, 409]);
  const adjacent = await meeting(uri, create('08:30', '09:00'));
  await meeting(uri, { ...cmd, from: '09:07' }, 400);
  await meeting(uri, { ...cmd, until: '07:30' }, 400);
  await meeting(uri, { ...cmd, date: nextSunday.plus({ days: 5 }).toISODate() }, 400);
  await meeting(admin, { ...cmd, date: nextSunday.plus({ weeks: 8 }).toISODate() });
  const edit = {
    ...create('08:30', '09:00', 'עדכון כותרת'),
    action: 'edit',
    meetingId: adjacent.id,
    version: 1,
  };
  await meeting(noa, edit, 403);
  await meeting(uri, edit);
  await meeting(uri, edit, 409);
});

test('boss confirmation is bound to the exact request and current meeting version', async () => {
  await role(noa, 'manager');
  await role(uri, 'boss');
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id });
  const pending = await meeting(noa, create('10:00', '11:00', 'פגישה א'));
  await request(uri, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: true,
  });
  const original = (await schedule()).find((m) => m.title === 'פגישה א');
  const change = create('10:30', '11:15', 'פגישה מחליפה');
  const review = await meeting(uri, change, 409);
  assert.equal(review.affected.length, 1);
  assert.equal(review.waitSeconds, 0);
  await meeting(uri, { ...change, title: 'שינוי נוסף' }, 409, review.token);
  await meeting(noa, {
    ...create('10:00', '11:00', 'פגישה מעודכנת'),
    action: 'edit',
    meetingId: original.id,
    version: original.version,
  });
  const fresh = await meeting(uri, change, 409, review.token);
  assert.equal(fresh.affected[0].title, 'פגישה מעודכנת');
  await meeting(uri, change, 201, fresh.token);
  assert.ok(!(await schedule()).some((m) => m.id === original.id));
});

test('Jerusalem month boundary, midnight and DST repeated hour', () => {
  const { interval } = require('../dist/server/meetings/schedule');
  const asOf = DateTime.fromISO('2027-01-31T10:00', { zone });
  const input = { ...create('23:45', '24:00'), date: '2027-02-14' };
  const [start, end] = interval(input, 'manager', asOf);
  assert.equal(Date.parse(end) - Date.parse(start), 15 * 60000);
  assert.throws(() => interval({ ...input, date: '2027-02-15' }, 'manager', asOf));
  assert.doesNotThrow(() => interval({ ...input, date: '2027-03-01' }, 'boss', asOf));
  const [fall] = interval(
    { ...input, date: '2027-10-31', from: '01:00', until: '02:00' },
    'boss',
    asOf,
  );
  assert.equal(fall, '2027-10-30T22:00:00.000Z');
});

test('logout revokes the session', async () => {
  await request(tamar, 'POST', 'auth/logout', {});
  await request(tamar, 'GET', 'workspace', undefined, 401);
});

test('assigned boss can move a manager meeting after review and notify the organizer', async () => {
  await role(noa, 'manager');
  await role(uri, 'boss');
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id });
  const pending = await meeting(noa, create('15:00', '15:30', 'עדכון'));
  await request(uri, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: true,
  });
  const original = (await schedule()).find((m) => m.title === 'עדכון');
  const change = {
    ...create('16:00', '16:30', 'עדכון'),
    action: 'edit',
    meetingId: original.id,
    version: original.version,
  };
  const review = await meeting(uri, change, 409);
  await meeting(uri, change, 201, review.token);
  const state = await workspace(noa);
  assert.equal(state.meetings[0].organizerId, noa.id);
  assert.equal(state.meetings[0].version, 2);
  assert.ok(state.notices.some((notice) => notice.message.includes('עודכנה')));
});

test('room records give independent calendars without changing booking logic', async () => {
  await role(noa, 'boss');
  await role(uri, 'boss');
  const { rows } = await pool.query(
    "INSERT INTO rooms(site,name) VALUES ('MBT','חדר נוסף') RETURNING id",
  );
  await Promise.all([
    meeting(noa, create('17:00', '18:00')),
    meeting(uri, { ...create('17:00', '18:00'), roomId: rows[0].id }),
  ]);
  assert.equal((await schedule()).length, 1);
  const other = await request(noa, 'GET', 'meetings?room=' + rows[0].id + '&start=' + day);
  assert.equal(other.length, 1);
  assert.equal(other[0].organizerId, uri.id);
});

test('hierarchy changes require an admin, valid supervisor roles and reassignment of reports', async () => {
  await role(uri, 'manager');
  await role(tamar, 'boss');
  await request(noa, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id }, 403);
  await request(
    admin,
    'POST',
    'admin/supervisor',
    { personId: noa.id, supervisorId: tamar.id },
    400,
  );
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id });
  await request(admin, 'POST', 'admin/supervisor', { personId: uri.id, supervisorId: tamar.id });
  assert.equal((await workspace(noa)).me.supervisorId, uri.id);
  await request(admin, 'POST', 'admin/role', { personId: uri.id, role: 'user' }, 409);
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: null });
  await role(uri, 'user');
  assert.equal((await workspace(uri)).me.supervisorId, null);
  await request(noa, 'POST', 'admin/rooms', { site: 'MBT', name: 'חדר היררכיה' }, 403);
  const room = await request(admin, 'POST', 'admin/rooms', { site: 'MBT', name: 'חדר היררכיה' });
  assert.equal(room.site, 'MBT');
});

test('manager requests hold a room, require the assigned boss and expire safely', async () => {
  await role(noa, 'manager');
  await role(uri, 'boss');
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id });
  const pending = await meeting(noa, create('09:00', '10:00'));
  assert.equal(pending.pending, true);
  await meeting(admin, create('09:00', '10:00'), 409);
  await request(
    tamar,
    'POST',
    'meetings/requests/decision',
    { requestId: pending.id, approve: true },
    403,
  );
  await request(uri, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: true,
  });
  assert.equal((await schedule()).filter((m) => m.title === 'ישיבת צוות' && !m.pending).length, 1);
  const next = await meeting(noa, create('11:00', '12:00'));
  await pool.query("UPDATE meeting_requests SET expires=now()-interval '1 second' WHERE id=$1", [
    next.id,
  ]);
  await meeting(admin, create('11:00', '12:00'));
  assert.equal(
    (await pool.query('SELECT status FROM meeting_requests WHERE id=$1', [next.id])).rows[0].status,
    'expired',
  );
});

test('boss takeover holds the time until the other boss approves', async () => {
  await role(noa, 'boss');
  await role(uri, 'boss');
  const original = await meeting(uri, create('09:00', '10:00', 'מקור'));
  const pending = await meeting(noa, create('09:15', '10:15', 'חלופית'));
  assert.equal(pending.pending, true);
  assert.ok((await schedule()).some((m) => m.id === original.id));
  await meeting(admin, create('10:00', '10:15'), 409);
  await request(uri, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: true,
  });
  const after = await schedule();
  assert.equal(
    after.some((m) => m.id === original.id),
    false,
  );
  assert.ok(after.some((m) => m.title === 'חלופית' && !m.pending));
});

test('a takeover waits for every affected boss and preserves bookings until final approval', async () => {
  await Promise.all([role(noa, 'boss'), role(uri, 'boss'), role(tamar, 'boss')]);
  const first = await meeting(uri, create('09:00', '10:00', 'אחת'));
  const second = await meeting(tamar, create('10:00', '11:00', 'שתיים'));
  const requestId = (await meeting(noa, create('09:30', '10:30', 'חדשה'))).id;
  await request(uri, 'POST', 'meetings/requests/decision', { requestId, approve: true });
  let meetings = await schedule();
  assert.ok(meetings.some((m) => m.id === first.id));
  assert.ok(meetings.some((m) => m.id === second.id));
  await request(tamar, 'POST', 'meetings/requests/decision', { requestId, approve: true });
  meetings = await schedule();
  assert.ok(meetings.some((m) => m.title === 'חדשה' && !m.pending));
  assert.ok(!meetings.some((m) => m.id === first.id || m.id === second.id));
});

test('private meeting details are restricted and invitations require an explicit response', async () => {
  await role(uri, 'boss');
  const created = await meeting(uri, {
    ...create('13:00', '14:00', 'מידע סודי'),
    private: true,
    visit: true,
    invitees: [noa.id],
  });
  const publicView = (
    await request(tamar, 'GET', 'meetings?room=' + roomId + '&start=' + day)
  ).find((m) => m.id === created.id);
  assert.equal(publicView.title, 'פגישה פרטית');
  assert.equal(publicView.description, '');
  assert.equal(publicView.visit, false);
  const inviteeView = (await schedule()).find((m) => m.id === created.id);
  assert.equal(inviteeView.title, 'מידע סודי');
  assert.equal(inviteeView.visit, true);
  assert.equal((await request(noa, 'GET', 'meetings/invitations')).length, 1);
  await request(noa, 'POST', 'meetings/invitations/decision', {
    meetingId: created.id,
    accept: true,
  });
  assert.equal((await request(noa, 'GET', 'meetings/invitations')).length, 0);
  assert.equal(
    (
      await pool.query(
        'SELECT status FROM meeting_invitations WHERE meeting_id=$1 AND person_id=$2',
        [created.id, noa.id],
      )
    ).rows[0].status,
    'accepted',
  );
  await request(
    tamar,
    'POST',
    'meetings/invitations/decision',
    { meetingId: created.id, accept: true },
    409,
  );
});

test('recurring meetings can be canceled as an entire series', async () => {
  await role(uri, 'boss');
  const created = await meeting(uri, {
    ...create('09:00', '10:00', 'סדרה'),
    recurrence: { frequency: 'weekly', count: 3 },
  });
  const series = (await pool.query('SELECT series_id FROM meetings WHERE id=$1', [created.id]))
    .rows[0].series_id;
  assert.equal(
    (await pool.query('SELECT count(*)::int AS count FROM meetings WHERE series_id=$1', [series]))
      .rows[0].count,
    3,
  );
  await request(noa, 'POST', 'meetings/series/cancel', { seriesId: series }, 403);
  await request(uri, 'POST', 'meetings/series/cancel', { seriesId: series });
  assert.equal(
    (await pool.query('SELECT count(*)::int AS count FROM meetings WHERE series_id=$1', [series]))
      .rows[0].count,
    0,
  );
});

test('release and swap requests apply only after their owners approve', async () => {
  await role(noa, 'boss');
  await role(uri, 'boss');
  const first = await meeting(noa, create('09:00', '10:00', 'ראשונה'));
  const second = await meeting(uri, create('11:00', '12:00', 'שנייה'));
  const swap = await request(noa, 'POST', 'meetings/exchange', {
    kind: 'swap',
    meetingId: first.id,
    otherMeetingId: second.id,
  });
  await request(
    tamar,
    'POST',
    'meetings/exchange/decision',
    { requestId: swap.id, approve: true },
    403,
  );
  await request(uri, 'POST', 'meetings/exchange/decision', { requestId: swap.id, approve: true });
  let meetings = await schedule();
  assert.equal(
    DateTime.fromISO(meetings.find((m) => m.id === first.id).start)
      .setZone(zone)
      .toFormat('HH:mm'),
    '11:00',
  );
  assert.equal(
    DateTime.fromISO(meetings.find((m) => m.id === second.id).start)
      .setZone(zone)
      .toFormat('HH:mm'),
    '09:00',
  );
  const release = await request(noa, 'POST', 'meetings/exchange', {
    kind: 'release',
    meetingId: second.id,
  });
  assert.ok((await schedule()).some((m) => m.id === second.id));
  await request(uri, 'POST', 'meetings/exchange/decision', {
    requestId: release.id,
    approve: true,
  });
  meetings = await schedule();
  assert.ok(!meetings.some((m) => m.id === second.id));
});

test('manager rescheduling keeps the original meeting and follows the current boss', async () => {
  await role(noa, 'manager');
  await role(uri, 'boss');
  await role(tamar, 'boss');
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id });
  const initial = await meeting(noa, create('09:00', '10:00', 'פגישה קיימת'));
  await request(uri, 'POST', 'meetings/requests/decision', {
    requestId: initial.id,
    approve: true,
  });
  const existing = (await schedule()).find((m) => m.title === 'פגישה קיימת');
  const change = {
    ...create('11:00', '12:00', 'פגישה מעודכנת'),
    action: 'edit',
    meetingId: existing.id,
    version: existing.version,
  };
  const pending = await meeting(noa, change);
  assert.equal(pending.pending, true);
  assert.ok((await schedule()).some((m) => m.id === existing.id && m.title === 'פגישה קיימת'));
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: tamar.id });
  await request(
    uri,
    'POST',
    'meetings/requests/decision',
    { requestId: pending.id, approve: true },
    403,
  );
  await request(tamar, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: true,
  });
  const changed = (await schedule()).find((m) => m.id === existing.id);
  assert.equal(changed.title, 'פגישה מעודכנת');
  assert.equal(DateTime.fromISO(changed.start).setZone(zone).toFormat('HH:mm'), '11:00');
});

test('series takeover waits for every affected boss before creating any occurrences', async () => {
  await Promise.all([role(noa, 'boss'), role(uri, 'boss'), role(tamar, 'boss')]);
  const followingWeek = nextSunday.plus({ weeks: 1 }).toISODate();
  const first = await meeting(uri, create('09:00', '10:00', 'ראשונה'));
  const second = await meeting(tamar, {
    ...create('09:00', '10:00', 'שנייה'),
    date: followingWeek,
  });
  const pending = await meeting(noa, {
    ...create('09:00', '10:00', 'סדרה ממתינה'),
    recurrence: { frequency: 'weekly', count: 2 },
  });
  assert.equal(pending.pending, true);
  await request(uri, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: true,
  });
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM meetings WHERE title='סדרה ממתינה'"))
      .rows[0].count,
    0,
  );
  await request(tamar, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: true,
  });
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM meetings WHERE title='סדרה ממתינה'"))
      .rows[0].count,
    2,
  );
  assert.equal(
    (
      await pool.query('SELECT count(*)::int AS count FROM meetings WHERE id=ANY($1::int[])', [
        [first.id, second.id],
      ])
    ).rows[0].count,
    0,
  );
});

test('editing future series occurrences waits for conflicts and preserves earlier meetings', async () => {
  await role(noa, 'boss');
  await role(uri, 'boss');
  const series = await meeting(uri, {
    ...create('09:00', '10:00', 'סדרת מקור'),
    recurrence: { frequency: 'weekly', count: 3 },
    private: true,
  });
  const rows = (
    await pool.query(
      'SELECT id,version,series_id,starts FROM meetings WHERE series_id=(SELECT series_id FROM meetings WHERE id=$1) ORDER BY starts',
      [series.id],
    )
  ).rows;
  const collision = await meeting(noa, {
    ...create('10:00', '11:00', 'פגישה חופפת'),
    date: nextSunday.plus({ weeks: 2 }).toISODate(),
  });
  const change = {
    ...create('10:00', '11:00', 'סדרה מעודכנת'),
    date: nextSunday.plus({ weeks: 1 }).toISODate(),
    action: 'edit',
    meetingId: rows[1].id,
    version: rows[1].version,
    scope: 'following',
    private: false,
  };
  const pending = await meeting(uri, change);
  assert.equal(pending.pending, true);
  const approval = (await request(noa, 'GET', 'meetings/requests')).find(
    (item) => item.id === pending.id,
  );
  assert.equal(approval.title, 'פגישה פרטית');
  assert.ok(approval.targets.every((item) => item.title === 'פגישה פרטית'));
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM meetings WHERE title='סדרה מעודכנת'")).rows[0]
      .n,
    0,
  );
  await request(noa, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: true,
  });
  const after = (
    await pool.query('SELECT id,title FROM meetings WHERE series_id=$1 ORDER BY starts', [
      rows[0].series_id,
    ])
  ).rows;
  assert.deepEqual(
    after.map((m) => m.title),
    ['סדרת מקור', 'סדרה מעודכנת', 'סדרה מעודכנת'],
  );
  const privacy = (
    await pool.query('SELECT private FROM meetings WHERE series_id=$1 ORDER BY starts', [
      rows[0].series_id,
    ])
  ).rows;
  assert.deepEqual(
    privacy.map((meeting) => meeting.private),
    [true, false, false],
  );
  assert.equal(
    (await pool.query('SELECT 1 FROM meetings WHERE id=$1', [collision.id])).rowCount,
    0,
  );
  await request(uri, 'POST', 'meetings/series/cancel', {
    seriesId: rows[0].series_id,
    fromMeetingId: rows[1].id,
  });
  assert.equal(
    (
      await pool.query('SELECT count(*)::int AS n FROM meetings WHERE series_id=$1', [
        rows[0].series_id,
      ])
    ).rows[0].n,
    1,
  );
});

test('an admin can review and override a pending hold', async () => {
  await role(noa, 'manager');
  await role(uri, 'boss');
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id });
  const pending = await meeting(noa, create('09:00', '10:00', 'בקשה שממתינה'));
  const change = create('09:15', '09:45', 'פגישת מנהל מערכת');
  const review = await meeting(admin, change, 409);
  assert.equal(review.affected.length, 1);
  assert.match(review.affected[0].title, /בקשה ממתינה/);
  await meeting(admin, change, 201, review.token);
  assert.equal(
    (await pool.query('SELECT status FROM meeting_requests WHERE id=$1', [pending.id])).rows[0]
      .status,
    'invalidated',
  );
  assert.ok(
    (await workspace(noa)).notices.some((notice) => notice.message.includes('מנהל המערכת')),
  );
});

test('migrations preserve existing employees and meetings', async () => {
  const { randomUUID } = require('node:crypto');
  const { readFileSync } = require('node:fs');
  const schema = 'upgrade_' + randomUUID().replaceAll('-', '');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(readFileSync('server/db/001_initial.sql', 'utf8'));
    const person = await client.query(
      "INSERT INTO people(source,upn,name,surname,role,site) VALUES ('dev','old@example.test','ישן','עובד','boss','MID') RETURNING id",
    );
    await client.query(
      "INSERT INTO meetings(room_id,organizer_id,title,description,starts,ends) VALUES (1,$1,'קיימת','תיאור','2030-01-01 09:00+02','2030-01-01 10:00+02')",
      [person.rows[0].id],
    );
    await client.query(readFileSync('server/db/002_hierarchy.sql', 'utf8'));
    await client.query(readFileSync('server/db/003_meeting_workflows.sql', 'utf8'));
    const employee = (
      await client.query('SELECT role,supervisor_id FROM people WHERE id=$1', [person.rows[0].id])
    ).rows[0];
    assert.deepEqual(employee, { role: 'boss', supervisor_id: null });
    const original = (await client.query('SELECT title,private,visit,series_id FROM meetings'))
      .rows[0];
    assert.deepEqual(original, { title: 'קיימת', private: false, visit: false, series_id: null });
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

test('an admin can approve an existing manager request while its supervisor is unassigned', async () => {
  await role(noa, 'manager');
  await role(uri, 'boss');
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id });
  const pending = await meeting(noa, create('09:00', '10:00', 'בקשה ללא ממונה זמנית'));
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: null });
  await request(
    uri,
    'POST',
    'meetings/requests/decision',
    { requestId: pending.id, approve: true },
    403,
  );
  assert.ok(
    (await request(admin, 'GET', 'meetings/requests')).some((item) => item.id === pending.id),
  );
  await request(admin, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: true,
  });
  assert.ok(
    (await schedule()).some((item) => item.title === 'בקשה ללא ממונה זמנית' && !item.pending),
  );
});

test('request owners can cancel a hold and users can cancel their own legacy meetings', async () => {
  await role(noa, 'manager');
  await role(uri, 'boss');
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id });
  const pending = await meeting(noa, create('09:00', '10:00'));
  await request(tamar, 'POST', 'meetings/requests/cancel', { requestId: pending.id }, 403);
  await request(noa, 'POST', 'meetings/requests/cancel', { requestId: pending.id });
  assert.equal(
    (await pool.query('SELECT status FROM meeting_requests WHERE id=$1', [pending.id])).rows[0]
      .status,
    'cancelled',
  );
  await meeting(uri, create('09:00', '10:00'));
  const legacy = await pool.query(
    'INSERT INTO meetings(room_id,organizer_id,title,description,starts,ends) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,version',
    [
      roomId,
      tamar.id,
      'ישנה',
      'תיאור',
      nextSunday.set({ hour: 11 }).toUTC().toISO(),
      nextSunday.set({ hour: 12 }).toUTC().toISO(),
    ],
  );
  await meeting(tamar, create('13:00', '14:00'), 403);
  await meeting(tamar, {
    action: 'cancel',
    roomId,
    meetingId: legacy.rows[0].id,
    version: legacy.rows[0].version,
  });
  assert.ok(!(await schedule()).some((item) => item.id === legacy.rows[0].id));
});

test('concurrent hierarchy updates never leave a user assigned to a non-manager', async () => {
  await role(uri, 'manager');
  const call = (path, body) =>
    app.inject({
      method: 'POST',
      url: '/api/' + path,
      headers: { cookie: admin.cookie, 'x-my-space': '1' },
      payload: body,
    });
  const results = await Promise.all([
    call('admin/supervisor', { personId: noa.id, supervisorId: uri.id }),
    call('admin/role', { personId: uri.id, role: 'user' }),
  ]);
  assert.equal(results.filter((result) => result.statusCode === 201).length, 1);
  const assigned = (
    await pool.query(
      'SELECT p.role,s.role AS supervisor_role FROM people p LEFT JOIN people s ON s.id=p.supervisor_id WHERE p.id=$1',
      [noa.id],
    )
  ).rows[0];
  assert.ok(assigned.supervisor_role === null || assigned.supervisor_role === 'manager');
});

test('concurrent approval and administrator override cannot create overlapping meetings', async () => {
  await role(noa, 'manager');
  await role(uri, 'boss');
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id });
  const pending = await meeting(noa, create('09:00', '10:00', 'בקשת מנהל'));
  const adminChange = create('09:15', '09:45', 'פגישת מנהל מערכת');
  const review = await meeting(admin, adminChange, 409);
  const call = (person, path, body) =>
    app.inject({
      method: 'POST',
      url: '/api/' + path,
      headers: { cookie: person.cookie, 'x-my-space': '1' },
      payload: body,
    });
  const results = await Promise.all([
    call(uri, 'meetings/requests/decision', { requestId: pending.id, approve: true }),
    call(admin, 'meetings', { change: adminChange, token: review.token }),
  ]);
  assert.deepEqual(results.map((result) => result.statusCode).sort(), [201, 409]);
  const confirmed = (await schedule()).filter((meeting) => !meeting.pending);
  assert.equal(confirmed.length, 1);
});

test('an admin can approve all affected bosses at once', async () => {
  await Promise.all([role(noa, 'boss'), role(uri, 'boss'), role(tamar, 'boss')]);
  await meeting(uri, create('09:00', '10:00', 'אחת'));
  await meeting(tamar, create('10:00', '11:00', 'שתיים'));
  const pending = await meeting(noa, create('09:30', '10:30', 'אושרה על ידי מנהל מערכת'));
  await request(admin, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: true,
  });
  const confirmed = (await schedule()).filter((meeting) => !meeting.pending);
  assert.deepEqual(
    confirmed.map((meeting) => meeting.title),
    ['אושרה על ידי מנהל מערכת'],
  );
});

test('private pending requests hide their contents until an invitation is actually sent', async () => {
  await role(noa, 'manager');
  await role(uri, 'boss');
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id });
  const pending = await meeting(noa, {
    ...create('14:00', '15:00', 'מידע פרטי לפני אישור'),
    private: true,
    visit: true,
    invitees: [tamar.id],
  });
  const visibleToInvitee = await request(tamar, 'GET', 'meetings?room=' + roomId + '&start=' + day);
  assert.equal(visibleToInvitee.find((item) => item.pending).title, 'פגישה פרטית');
  assert.equal((await request(tamar, 'GET', 'meetings/invitations')).length, 0);
  const visibleToBoss = await request(uri, 'GET', 'meetings/requests');
  assert.equal(visibleToBoss.find((item) => item.id === pending.id).title, 'מידע פרטי לפני אישור');
  assert.equal(visibleToBoss.find((item) => item.id === pending.id).description, 'עדכון שבועי');
  assert.equal(visibleToBoss.find((item) => item.id === pending.id).visit, true);
  assert.ok(
    visibleToBoss
      .find((item) => item.id === pending.id)
      .invitees.some((person) => person.id === tamar.id),
  );
  await request(uri, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: true,
  });
  assert.equal(
    (await request(tamar, 'GET', 'meetings/invitations'))[0].title,
    'מידע פרטי לפני אישור',
  );
});

test('a changed boss meeting invalidates a pending takeover and releases its hold', async () => {
  await role(noa, 'boss');
  await role(uri, 'boss');
  const original = await meeting(uri, create('14:00', '15:00', 'פרטי מקור'));
  const pending = await meeting(noa, create('14:15', '14:45', 'בקשת החלפה'));
  await meeting(uri, {
    ...create('14:00', '15:00', 'עודכן'),
    action: 'edit',
    meetingId: original.id,
    version: 1,
  });
  assert.equal(
    (await pool.query('SELECT status FROM meeting_requests WHERE id=$1', [pending.id])).rows[0]
      .status,
    'invalidated',
  );
  assert.ok((await workspace(noa)).notices.some((notice) => notice.message.includes('השתנתה')));
  await request(
    uri,
    'POST',
    'meetings/requests/decision',
    { requestId: pending.id, approve: true },
    409,
  );
});

test('daily series skips closed weekends and uses an inclusive end date', async () => {
  await role(uri, 'boss');
  const thursday = nextSunday.plus({ days: 4 });
  const monday = nextSunday.plus({ days: 8 });
  const created = await meeting(uri, {
    ...create('09:00', '10:00', 'ימי עבודה'),
    date: thursday.toISODate(),
    recurrence: { frequency: 'daily', endDate: monday.toISODate() },
  });
  const rows = (
    await pool.query(
      'SELECT starts FROM meetings WHERE series_id=(SELECT series_id FROM meetings WHERE id=$1) ORDER BY starts',
      [created.id],
    )
  ).rows;
  assert.deepEqual(
    rows.map((item) => DateTime.fromJSDate(item.starts).setZone(zone).toISODate()),
    [thursday.toISODate(), nextSunday.plus({ days: 7 }).toISODate(), monday.toISODate()],
  );
  await role(noa, 'manager');
  await meeting(
    noa,
    { ...create('11:00', '12:00'), recurrence: { frequency: 'weekly', count: 2 } },
    403,
  );
});

test('a rejected boss takeover leaves the original meeting intact', async () => {
  await role(noa, 'boss');
  await role(uri, 'boss');
  const original = await meeting(uri, create('09:00', '10:00', 'פגישה מקורית'));
  const pending = await meeting(noa, create('09:15', '09:45', 'בקשה שנדחתה'));
  await request(uri, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: false,
  });
  assert.equal(
    (await pool.query('SELECT status FROM meeting_requests WHERE id=$1', [pending.id])).rows[0]
      .status,
    'rejected',
  );
  assert.ok((await schedule()).some((meeting) => meeting.id === original.id));
  assert.ok((await workspace(noa)).notices.some((notice) => notice.message.includes('נדחתה')));
});

test('updating following occurrences requires a fresh review if another occurrence changes', async () => {
  await role(uri, 'boss');
  const created = await meeting(uri, {
    ...create('09:00', '10:00', 'סדרה קודמת'),
    recurrence: { frequency: 'weekly', count: 3 },
  });
  const rows = (
    await pool.query(
      'SELECT id,version FROM meetings WHERE series_id=(SELECT series_id FROM meetings WHERE id=$1) ORDER BY starts',
      [created.id],
    )
  ).rows;
  const nextDate = nextSunday.plus({ weeks: 1 }).toISODate();
  const edit = {
    ...create('10:00', '11:00', 'סדרה חדשה'),
    date: nextDate,
    action: 'edit',
    meetingId: rows[1].id,
    version: 1,
    scope: 'following',
  };
  const review = await meeting(uri, edit, 409);
  const lastDate = nextSunday.plus({ weeks: 2 }).toISODate();
  await meeting(uri, {
    ...create('09:00', '10:00', 'שינוי ביניים'),
    date: lastDate,
    action: 'edit',
    meetingId: rows[2].id,
    version: 1,
  });
  const refreshed = await meeting(uri, edit, 409, review.token);
  assert.ok(refreshed.affected.some((item) => item.title === 'שינוי ביניים'));
  await meeting(uri, edit, 201, refreshed.token);
  const titles = (
    await pool.query('SELECT title FROM meetings WHERE id=ANY($1::int[]) ORDER BY starts', [
      rows.map((item) => item.id),
    ])
  ).rows.map((item) => item.title);
  assert.deepEqual(titles, ['סדרה קודמת', 'סדרה חדשה', 'סדרה חדשה']);
});

test('manager and boss permissions are enforced for conflicts, invitations and other bosses', async () => {
  await role(noa, 'manager');
  await role(uri, 'boss');
  await role(tamar, 'boss');
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id });
  const occupied = await meeting(tamar, create('09:00', '10:00', 'חדר תפוס'));
  await meeting(noa, create('09:15', '09:45'), 409);
  await meeting(uri, { action: 'cancel', roomId, meetingId: occupied.id, version: 1 }, 403);
  await meeting(noa, { ...create('11:00', '12:00'), invitees: [999999] }, 400);
  await request(noa, 'GET', 'people/search?q=אורי');
  const result = await request(noa, 'GET', 'people/search?q=לאקיים');
  assert.deepEqual(result, []);
});

test('private conflict previews and attendee endpoints do not disclose details to another boss', async () => {
  await role(noa, 'boss');
  await role(uri, 'boss');
  const original = await meeting(uri, {
    ...create('09:00', '10:00', 'כותרת חסויה'),
    private: true,
    invitees: [tamar.id],
  });
  await request(noa, 'GET', 'meetings/attendees?meeting=' + original.id, undefined, 403);
  const pending = await meeting(noa, create('09:15', '09:45', 'בקשה'));
  const requestList = await request(noa, 'GET', 'meetings/requests');
  const record = requestList.find((item) => item.id === pending.id);
  assert.equal(record.conflicts[0].title, 'פגישה פרטית');
  assert.ok(!JSON.stringify(record).includes('כותרת חסויה'));
});

test('changing one meeting invalidates a swap without changing the other', async () => {
  await role(noa, 'boss');
  await role(uri, 'boss');
  const first = await meeting(noa, create('09:00', '10:00', 'אחת'));
  const second = await meeting(uri, create('11:00', '12:00', 'שתיים'));
  const pending = await request(noa, 'POST', 'meetings/exchange', {
    kind: 'swap',
    meetingId: first.id,
    otherMeetingId: second.id,
  });
  await meeting(uri, {
    ...create('11:00', '12:00', 'שתיים עודכנה'),
    action: 'edit',
    meetingId: second.id,
    version: 1,
  });
  assert.equal(
    (await pool.query('SELECT status FROM meeting_exchange_requests WHERE id=$1', [pending.id]))
      .rows[0].status,
    'invalidated',
  );
  await request(
    uri,
    'POST',
    'meetings/exchange/decision',
    { requestId: pending.id, approve: true },
    409,
  );
  const rows = await schedule();
  assert.equal(
    DateTime.fromISO(rows.find((row) => row.id === first.id).start)
      .setZone(zone)
      .toFormat('HH:mm'),
    '09:00',
  );
  assert.equal(
    DateTime.fromISO(rows.find((row) => row.id === second.id).start)
      .setZone(zone)
      .toFormat('HH:mm'),
    '11:00',
  );
});

test('a rejected recurring takeover creates no partial series and releases all holds', async () => {
  await role(noa, 'boss');
  await role(uri, 'boss');
  const original = await meeting(uri, create('09:00', '10:00', 'מקור'));
  const pending = await meeting(noa, {
    ...create('09:00', '10:00', 'סדרה נדחתה'),
    recurrence: { frequency: 'weekly', count: 2 },
  });
  await request(uri, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: false,
  });
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM meetings WHERE title='סדרה נדחתה'")).rows[0]
      .n,
    0,
  );
  assert.ok((await schedule()).some((meeting) => meeting.id === original.id));
  const following = await meeting(uri, {
    ...create('09:00', '10:00', 'מועד שהתפנה'),
    date: nextSunday.plus({ weeks: 1 }).toISODate(),
  });
  assert.ok(following.id);
});

test('a boss reviewing another boss private takeover sees only permitted details', async () => {
  await role(noa, 'boss');
  await role(uri, 'boss');
  await meeting(uri, create('09:00', '10:00', 'הפגישה שלי'));
  const pending = await meeting(noa, {
    ...create('09:15', '09:45', 'נושא חסוי'),
    private: true,
    visit: true,
    invitees: [tamar.id],
  });
  const record = (await request(uri, 'GET', 'meetings/requests')).find(
    (item) => item.id === pending.id,
  );
  assert.equal(record.title, 'פגישה פרטית');
  assert.equal(record.description, '');
  assert.equal(record.visit, false);
  assert.deepEqual(record.invitees, []);
  assert.ok(record.conflicts.some((item) => item.title === 'הפגישה שלי'));
});

test('a manager does not gain access to a former boss private meeting after a role change', async () => {
  await role(noa, 'manager');
  await role(uri, 'boss');
  const created = await meeting(uri, {
    ...create('09:00', '10:00', 'פגישה פרטית ישנה'),
    private: true,
  });
  await role(uri, 'user');
  await request(admin, 'POST', 'admin/supervisor', { personId: uri.id, supervisorId: noa.id });
  const entry = (await schedule()).find((item) => item.id === created.id);
  assert.equal(entry.title, 'פגישה פרטית');
  await request(noa, 'GET', 'meetings/attendees?meeting=' + created.id, undefined, 403);
});

test('a boss can propose a swap between two other owners who both must approve', async () => {
  await Promise.all([role(noa, 'boss'), role(uri, 'boss'), role(tamar, 'boss')]);
  const first = await meeting(uri, create('09:00', '10:00', 'אצל אורי'));
  const second = await meeting(tamar, create('11:00', '12:00', 'אצל תמר'));
  const pending = await request(noa, 'POST', 'meetings/exchange', {
    kind: 'swap',
    meetingId: first.id,
    otherMeetingId: second.id,
  });
  const firstDecision = await request(uri, 'POST', 'meetings/exchange/decision', {
    requestId: pending.id,
    approve: true,
  });
  assert.equal(firstDecision.status, 'pending');
  assert.equal(
    DateTime.fromISO((await schedule()).find((item) => item.id === first.id).start)
      .setZone(zone)
      .toFormat('HH:mm'),
    '09:00',
  );
  await request(tamar, 'POST', 'meetings/exchange/decision', {
    requestId: pending.id,
    approve: true,
  });
  assert.equal(
    DateTime.fromISO((await schedule()).find((item) => item.id === first.id).start)
      .setZone(zone)
      .toFormat('HH:mm'),
    '11:00',
  );
});

test('a manager moving a meeting to another room needs approval and holds the destination', async () => {
  await role(noa, 'manager');
  await role(uri, 'boss');
  await request(admin, 'POST', 'admin/supervisor', { personId: noa.id, supervisorId: uri.id });
  const destination = await request(admin, 'POST', 'admin/rooms', {
    site: 'MBT',
    name: 'חדר מעבר מנהל',
  });
  const initial = await meeting(noa, create('09:00', '10:00', 'פגישה להעברה'));
  await request(uri, 'POST', 'meetings/requests/decision', {
    requestId: initial.id,
    approve: true,
  });
  const original = (await schedule()).find((item) => item.title === 'פגישה להעברה');
  const moved = await meeting(noa, {
    ...create('09:00', '10:00', 'פגישה להעברה'),
    action: 'edit',
    roomId: destination.id,
    meetingId: original.id,
    version: original.version,
  });
  assert.equal(moved.pending, true);
  assert.equal(
    (await pool.query('SELECT room_id FROM meetings WHERE id=$1', [original.id])).rows[0].room_id,
    roomId,
  );
  const review = await meeting(admin, { ...create('09:00', '10:00'), roomId: destination.id }, 409);
  assert.match(review.affected[0].title, /בקשה ממתינה/);
  await request(uri, 'POST', 'meetings/requests/decision', { requestId: moved.id, approve: true });
  assert.equal(
    (await pool.query('SELECT room_id FROM meetings WHERE id=$1', [original.id])).rows[0].room_id,
    destination.id,
  );
});

test('a boss can request approval to move an existing meeting over another boss booking', async () => {
  await role(noa, 'boss');
  await role(uri, 'boss');
  const destination = await request(admin, 'POST', 'admin/rooms', {
    site: 'MARP',
    name: 'חדר מעבר בכיר',
  });
  const original = await meeting(uri, create('09:00', '10:00', 'פגישה להעברה'));
  const occupied = await meeting(noa, {
    ...create('09:00', '10:00', 'פגישה קיימת'),
    roomId: destination.id,
  });
  const pending = await meeting(uri, {
    ...create('09:00', '10:00', 'פגישה מועברת'),
    action: 'edit',
    roomId: destination.id,
    meetingId: original.id,
    version: 1,
  });
  assert.equal(pending.pending, true);
  assert.equal(
    (await pool.query('SELECT room_id FROM meetings WHERE id=$1', [original.id])).rows[0].room_id,
    roomId,
  );
  await request(noa, 'POST', 'meetings/requests/decision', {
    requestId: pending.id,
    approve: true,
  });
  assert.equal(
    (await pool.query('SELECT room_id FROM meetings WHERE id=$1', [original.id])).rows[0].room_id,
    destination.id,
  );
  assert.equal((await pool.query('SELECT 1 FROM meetings WHERE id=$1', [occupied.id])).rowCount, 0);
});
