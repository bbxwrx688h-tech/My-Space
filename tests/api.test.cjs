const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const { testDatabase } = require('./database.cjs');

let app, pool, cleanup, admin, noa, uri, tamar, roomId;
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

test('calendar validation, concurrent creates, adjacent times, stale edit and regular admin privileges', async () => {
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
  await meeting(admin, cmd, 409);
  await meeting(noa, create('08:30', '09:00'));
  await meeting(noa, { ...cmd, from: '09:07' }, 400);
  await meeting(noa, { ...cmd, until: '07:30' }, 400);
  await meeting(noa, { ...cmd, date: nextSunday.plus({ days: 5 }).toISODate() }, 400);
  await meeting(admin, { ...cmd, date: nextSunday.plus({ weeks: 8 }).toISODate() }, 400);
  const row = (await schedule()).find(
    (m) =>
      m.start.includes('T') &&
      m.organizerId === noa.id &&
      DateTime.fromISO(m.start, { zone }).hour === 8 &&
      DateTime.fromISO(m.start, { zone }).minute === 30,
  );
  const edit = {
    ...create('08:30', '09:00', 'עדכון כותרת'),
    action: 'edit',
    meetingId: row.id,
    version: row.version,
  };
  await meeting(uri, edit, 403);
  await meeting(noa, edit);
  await meeting(noa, edit, 409);
});

test('boss confirmation is bound to conflict versions, affected people, exact request and current roles', async () => {
  await role(uri, 'boss');
  await role(tamar, 'boss');
  await meeting(uri, {
    ...create('07:00', '08:00'),
    date: nextSunday.plus({ weeks: 8 }).toISODate(),
  });
  await meeting(noa, create('10:00', '11:00', 'פגישה א'));
  const original = (await meeting(tamar, create('11:00', '12:00', 'פגישה ב'))).id;
  const change = create('10:30', '11:15', 'פגישה מחליפה');
  const review = await meeting(uri, change, 409);
  assert.equal(review.affected.length, 2);
  assert.equal(review.waitSeconds, 5);
  await meeting(uri, change, 409, review.token);
  await role(tamar, 'user');
  const afterDemotion = await meeting(uri, change, 409, review.token);
  assert.equal(afterDemotion.waitSeconds, 0);
  await meeting(uri, { ...change, title: 'שינוי נוסף' }, 409, afterDemotion.token);
  await meeting(uri, change, 201, afterDemotion.token);
  const remaining = await schedule();
  assert.ok(!remaining.some((m) => m.id === original || m.title === 'פגישה א'));
  assert.ok((await workspace(noa)).notices.some((n) => n.message.includes('פגישה א')));
  await role(tamar, 'boss');
  const row = remaining.find((m) => m.title === 'פגישה מחליפה');
  const cancel = { action: 'cancel', roomId, meetingId: row.id, version: row.version };
  const reviewCancel = await meeting(tamar, cancel, 409);
  assert.equal(reviewCancel.waitSeconds, 5);
  await meeting(tamar, cancel, 409, reviewCancel.token);
  await new Promise((resolve) => setTimeout(resolve, 5100));
  await meeting(tamar, cancel, 201, reviewCancel.token);
  assert.ok((await workspace(uri)).notices.some((n) => n.message.includes('בוטלה')));
});

test('Jerusalem month boundary, midnight and DST repeated hour', () => {
  const { interval } = require('../dist/server/meetings/schedule');
  const asOf = DateTime.fromISO('2027-01-31T10:00', { zone });
  const input = { ...create('23:45', '24:00'), date: '2027-02-28' };
  const [start, end] = interval(input, 'user', asOf);
  assert.equal(Date.parse(end) - Date.parse(start), 15 * 60000);
  assert.throws(() => interval({ ...input, date: '2027-03-01' }, 'user', asOf));
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

test('another editor changing an overlapping meeting invalidates the boss preview', async () => {
  await role(uri, 'boss');
  const { id } = await meeting(noa, create('13:00', '14:00', 'תכנון'));
  const replacement = create('13:15', '13:30', 'דיון');
  const first = await meeting(uri, replacement, 409);
  await meeting(noa, {
    ...create('13:00', '14:15', 'תכנון מעודכן'),
    action: 'edit',
    meetingId: id,
    version: 1,
  });
  const fresh = await meeting(uri, replacement, 409, first.token);
  assert.equal(fresh.affected[0].title, 'תכנון מעודכן');
  assert.equal((await workspace(noa)).notices.length, 0);
  await meeting(uri, replacement, 201, fresh.token);
});

test('moving another employee’s meeting preserves its organizer and notifies them', async () => {
  await role(uri, 'boss');
  const { id } = await meeting(noa, create('15:00', '15:30', 'עדכון'));
  const change = {
    ...create('16:00', '16:30', 'עדכון'),
    action: 'edit',
    meetingId: id,
    version: 1,
  };
  const review = await meeting(uri, change, 409);
  await meeting(uri, change, 201, review.token);
  const state = await workspace(noa);
  assert.equal(state.meetings[0].organizerId, noa.id);
  assert.equal(state.meetings[0].version, 2);
  assert.ok(state.notices[0].message.includes('עודכנה'));
});

test('room records give independent calendars without changing booking logic', async () => {
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
