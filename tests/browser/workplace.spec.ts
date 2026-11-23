import { test, expect, Page, BrowserContext } from '@playwright/test';
import { DateTime } from 'luxon';
import { join } from 'node:path';

const today = DateTime.now().setZone('Asia/Jerusalem').startOf('day');
const sunday = today.minus({ days: today.weekday % 7 }).plus({ weeks: 1 });
const future = sunday.toFormat('dd/MM/yy');

async function post(context: BrowserContext, path: string, body: unknown) {
  const res = await context.request.post('/api/' + path, {
    headers: { 'x-my-space': '1' },
    data: body,
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}
async function dev(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await page.getByLabel('חשבון פיתוח').selectOption(name + '@example.test');
  await page.getByRole('button', { name: 'כניסה', exact: true }).click();
}
async function selectDate(page: Page, label: string, date: DateTime) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const picker = page.getByRole('dialog', { name: label, exact: true });
  if (date.month !== today.month) await picker.getByRole('button', { name: 'חודש הבא' }).click();
  await picker.getByRole('button', { name: date.toFormat('dd/MM/yy'), exact: true }).click();
}
async function capture(page: Page, file: string) {
  if (process.env.QA_SCREENSHOT_DIR)
    await page.screenshot({
      path: join(process.env.QA_SCREENSHOT_DIR, file),
      animations: 'disabled',
    });
}

test('employee publishes a station, books a meeting, borrows selected days and releases one', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await dev(page, 'noa');
  await page.getByLabel(/אתר/).selectOption('MBT');
  await page.getByLabel('יש לי עמדה', { exact: true }).check();
  await page.getByLabel('מספר חדר').fill('204');
  await page.getByLabel('תיאור העמדה').fill('עמדה ליד החלון');
  await page.getByRole('button', { name: 'המשך לסביבת העבודה' }).click();
  await expect(page.getByRole('heading', { name: 'שלום, נועה' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ניהול משתמשים' })).toHaveCount(0);
  await page.goto('/#users');
  await expect(page.getByRole('heading', { name: 'ניהול משתמשים' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'שלום, נועה' })).toBeVisible();
  await page.getByRole('button', { name: 'פרסום הצעה לעמדה שלי' }).click();
  const publish = page.getByRole('dialog', { name: 'פרסום הצעה' });
  await selectDate(page, 'עד תאריך', today.plus({ days: 4 }));
  await publish.getByRole('button', { name: 'פרסום הצעה' }).click();
  await expect(publish).toHaveCount(0);
  await page.getByRole('link', { name: 'לבחירת עמדה' }).click();
  await expect(
    page.getByRole('article').getByText('עמדה ליד החלון', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'חדר ישיבות', exact: true }).click();
  await expect(page.getByRole('button', { name: 'פגישה חדשה' })).toHaveCount(0);
  await page.getByRole('button', { name: 'הבא', exact: true }).click();
  await page.getByRole('button', { name: 'הקודם', exact: true }).click();
  await expect(page.getByRole('button', { name: 'הקודם', exact: true })).toBeDisabled();
  await capture(page, 'calendar.png');

  // A second employee offers a different computer in the same physical room.
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:3191' });
  await post(other, 'auth/dev', { upn: 'uri@example.test' });
  await post(other, 'onboarding', {
    site: 'MID',
    station: { site: 'MID', room: '204', os: 'Linux', description: 'עמדה עם שני מסכים' },
  });
  const state = await (await other.request.get('/api/workspace')).json();
  await post(other, 'stations/offers', {
    stationId: state.stations[0].id,
    start: today.toISODate(),
    end: today.plus({ days: 5 }).toISODate(),
    note: 'ליד הדלת',
  });
  await page.reload();
  await page.getByRole('link', { name: 'עמדות עבודה', exact: true }).click();
  await page.getByLabel(/אתר/).selectOption('MID');
  await selectDate(page, 'מתאריך', today);
  await selectDate(page, 'עד תאריך', today.plus({ days: 6 }));
  const card = page.getByRole('article').filter({ hasText: 'עמדה עם שני מסכים' });
  await card.getByRole('button', { name: 'בחירת ימים' }).click();
  await capture(page, 'stations.png');
  const checks = page.getByRole('dialog').getByRole('checkbox');
  await checks.nth(0).check();
  await checks.nth(2).check();
  await page.getByRole('button', { name: 'אישור הזמנה (2)' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'בית', exact: true }).click();
  await page.getByRole('tab', { name: 'ההצעות שלי' }).click();
  await expect(page.getByRole('heading', { name: 'ההצעות שלי' })).toBeVisible();
  await page.getByRole('tab', { name: 'ההזמנות שלי' }).click();
  await expect(page.getByRole('button', { name: 'ניהול הזמנה' })).toHaveCount(2);
  await capture(page, 'home.png');
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: 'לבחירת עמדה' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await capture(page, 'mobile.png');
  await page.setViewportSize(viewport);
  await page.getByRole('button', { name: 'ניהול הזמנה' }).first().click();
  await page.getByRole('dialog').getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'אישור שחרור (1)' }).click();
  await expect(page.getByRole('button', { name: 'ניהול הזמנה' })).toHaveCount(1);
  await post(other, 'stations/days', {
    action: 'withdraw',
    offerId: (await (await other.request.get('/api/workspace')).json()).offers.find(
      (o: { station: { ownerId: number } }) => o.station.ownerId === state.me.id,
    ).id,
    days: [today.plus({ days: 2 }).toISODate()],
  });
  await page.reload();
  await page.getByRole('button', { name: 'התראות' }).click();
  await expect(page.getByText(/ההזמנה בוטלה/)).toBeVisible();
  await page.getByRole('button', { name: 'סימון הכול כנקרא' }).click();
  await expect(page.getByRole('button', { name: 'סימון הכול כנקרא' })).toHaveCount(0);
  await other.close();
  expect(errors).toEqual([]);
});

test('admin manages roles and a boss requests approval to take another boss meeting', async ({
  page,
  browser,
}) => {
  const a = await browser.newContext({ baseURL: 'http://127.0.0.1:3191' });
  const b = await browser.newContext({ baseURL: 'http://127.0.0.1:3191' });
  await post(a, 'auth/dev', { upn: 'uri@example.test' });
  await post(b, 'auth/dev', { upn: 'tamar@example.test' });
  for (const ctx of [a, b]) {
    const w = await (await ctx.request.get('/api/workspace')).json();
    if (!w.me.site) await post(ctx, 'onboarding', { site: 'MID' });
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת מנהל מערכת' }).click();
  await page.getByLabel('שם משתמש').fill('admin');
  await page.getByLabel('סיסמה').fill('local-test-password');
  await page.getByRole('button', { name: 'כניסה', exact: true }).click();
  await page.getByLabel('אני מחפש/ת עמדה').check();
  await page.getByRole('button', { name: 'המשך לסביבת העבודה' }).click();
  await page.getByRole('link', { name: 'ניהול משתמשים', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ניהול משתמשים' })).toBeVisible();
  await capture(page, 'admin-users.png');
  await page.getByLabel('חיפוש לפי שם או כתובת דוא״ל').fill('אורי');
  await expect(page.getByLabel(/תפקיד תמר ברק/)).toHaveCount(0);
  await page.getByLabel(/תפקיד אורי כהן/).selectOption('boss');
  await page.getByLabel('חיפוש לפי שם או כתובת דוא״ל').fill('תמר');
  await expect(page.getByLabel(/תפקיד תמר ברק/)).toBeEnabled();
  await page.getByLabel(/תפקיד תמר ברק/).selectOption('boss');
  await expect(page.getByLabel(/תפקיד תמר ברק/)).toBeEnabled();
  await page.getByLabel('חיפוש לפי שם או כתובת דוא״ל').fill('נועה');
  await page.getByLabel(/תפקיד נועה לוי/).selectOption('manager');
  await page.getByLabel(/ממונה נועה לוי/).selectOption({ label: 'אורי כהן · uri@example.test' });
  await expect(page.getByLabel(/ממונה נועה לוי/)).toHaveValue(
    String((await (await a.request.get('/api/workspace')).json()).me.id),
  );
  await page.getByLabel('שם חדר הישיבות').fill('חדר בדיקת מנהל');
  await page.getByRole('button', { name: 'הוספת חדר ישיבות' }).click();
  await expect(page.getByText('השינויים נשמרו')).toBeVisible();
  const workspace = await (await page.request.get('/api/workspace')).json();
  expect(
    workspace.rooms.some((room: { name: string }) => room.name === 'חדר בדיקת מנהל'),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'החשבון שלי' }).click();
  await page.getByRole('button', { name: 'יציאה מהמערכת' }).click();

  const state = await (await a.request.get('/api/workspace')).json();
  await post(a, 'meetings', {
    change: {
      action: 'create',
      roomId: state.rooms[0].id,
      date: sunday.toISODate(),
      from: '15:00',
      until: '16:00',
      title: 'ישיבת הנהלה',
      description: 'סדר יום',
    },
  });
  await dev(page, 'tamar');
  await page.getByRole('link', { name: 'לפתיחת היומן' }).click();
  await page.getByRole('button', { name: 'הבא', exact: true }).click();
  await page.getByRole('button', { name: 'הוספת פגישה ' + future, exact: true }).click();
  await page.getByLabel('כותרת הפגישה').fill('דיון חלופי');
  await page.getByLabel('תיאור הפגישה').fill('דיון המשך');
  await page.getByLabel('שעת התחלה שעות').selectOption('15');
  await page.getByLabel('שעת התחלה דקות').selectOption('15');
  await page.getByLabel('שעת סיום שעות').selectOption('15');
  await page.getByLabel('שעת סיום דקות').selectOption('45');
  await page.getByRole('button', { name: 'הוספת פגישה', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'בקשות והזמנות' })).toBeVisible();
  await expect(page.getByText(/דיון חלופי/)).toBeVisible();
  const approver = await a.newPage();
  await approver.goto('/#requests');
  const requestCard = approver.locator('section').filter({ hasText: 'דיון חלופי' });
  await expect(requestCard).toBeVisible();
  await requestCard.getByRole('button', { name: 'אישור', exact: true }).click();
  await expect(requestCard).toHaveCount(0);
  await page.goto('/#calendar');
  await page.getByRole('button', { name: 'הבא', exact: true }).click();
  await expect(page.getByRole('button', { name: /דיון חלופי/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /ישיבת הנהלה/ })).toHaveCount(0);
  await a.close();
  await b.close();
});

test('an employee adds a station later and withdraws a reserved day while another day stays offered', async ({
  page,
  browser,
}) => {
  await post(page.context(), 'auth/dev', { upn: 'tamar@example.test' });
  const state = await (await page.request.get('/api/workspace')).json();
  if (!state.me.site) await post(page.context(), 'onboarding', { site: 'MARP' });
  await page.goto('/#stations');
  await page.getByRole('button', { name: 'הוספת עמדה' }).click();
  const registration = page.getByRole('dialog', { name: 'הוספת עמדה' });
  await registration.getByLabel('אתר העמדה').selectOption('MARP');
  await registration.getByLabel('מספר חדר').fill('42');
  await registration.getByLabel('מערכת הפעלה').selectOption('Linux');
  await registration.getByLabel('תיאור העמדה').fill('שולחן ליד הדלת הירוקה');
  await registration.getByRole('button', { name: 'הוספת עמדה' }).click();
  await expect(registration).toHaveCount(0);
  await page.getByRole('button', { name: 'פרסום הצעה' }).click();
  await selectDate(page, 'עד תאריך', today.plus({ days: 1 }));
  await page.getByRole('dialog').getByRole('button', { name: 'פרסום הצעה' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const offers = (await (await page.request.get('/api/workspace')).json()).offers;
  const offer = offers.find(
    (o: { station: { description: string } }) => o.station.description === 'שולחן ליד הדלת הירוקה',
  );
  const borrower = await browser.newContext({ baseURL: 'http://127.0.0.1:3191' });
  await post(borrower, 'auth/dev', { upn: 'uri@example.test' });
  await post(borrower, 'stations/days', {
    action: 'book',
    offerId: offer.id,
    days: [today.toISODate(), today.plus({ days: 1 }).toISODate()],
  });
  await page.reload();
  await page
    .getByRole('article')
    .filter({ hasText: 'שולחן ליד הדלת הירוקה' })
    .getByRole('button', { name: 'ניהול ההצעה' })
    .click();
  await page
    .getByRole('checkbox', { name: /העמדה מוזמנת/ })
    .first()
    .check();
  await page.getByRole('button', { name: 'אישור הסרה (1)' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = await (await borrower.request.get('/api/workspace')).json();
  expect(after.offers.find((o: { id: number }) => o.id === offer.id).days).toEqual([
    { date: today.plus({ days: 1 }).toISODate(), status: 'mine' },
  ]);
  expect(after.notices.some((n: { message: string }) => n.message.includes('42'))).toBeTruthy();
  await borrower.close();
});

test('the home offer action continues to publishing after registering a first station', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת מנהל מערכת' }).click();
  await page.getByLabel('שם משתמש').fill('admin');
  await page.getByLabel('סיסמה').fill('local-test-password');
  await page.getByRole('button', { name: 'כניסה', exact: true }).click();
  await page.getByRole('button', { name: 'פרסום הצעה לעמדה שלי' }).click();
  const registration = page.getByRole('dialog', { name: 'הוספת עמדה' });
  await registration.getByLabel('מספר חדר').fill('101');
  await registration.getByLabel('תיאור העמדה').fill('עמדת בדיקה');
  await registration.getByRole('button', { name: 'הוספת עמדה' }).click();
  const publish = page.getByRole('dialog', { name: 'פרסום הצעה' });
  await expect(publish).toBeVisible();
  await expect(publish.getByLabel('העמדה שלי')).toContainText('עמדת בדיקה');
  await publish.getByRole('button', { name: 'פרסום הצעה' }).click();
  await expect(publish).toHaveCount(0);
});

test('the user directory can recover from a failed load and paginate search results', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת מנהל מערכת' }).click();
  await page.getByLabel('שם משתמש').fill('admin');
  await page.getByLabel('סיסמה').fill('local-test-password');
  await page.getByRole('button', { name: 'כניסה', exact: true }).click();
  const onboarding = page.getByLabel('אני מחפש/ת עמדה');
  if (await onboarding.isVisible()) {
    await onboarding.check();
    await page.getByRole('button', { name: 'המשך לסביבת העבודה' }).click();
  }
  let requests = 0;
  await page.route('**/api/admin/users', async (route) => {
    requests++;
    if (requests === 1) {
      await route.fulfill({ status: 503, json: { message: 'לא ניתן לטעון משתמשים' } });
      return;
    }
    await route.fulfill({
      json: Array.from({ length: 205 }, (_, index) => ({
        id: index + 1,
        name: 'עובד',
        surname: String(index + 1),
        upn: `employee${index + 1}@example.test`,
        role: 'user',
        site: 'MID',
      })),
    });
  });
  await page.getByRole('link', { name: 'ניהול משתמשים', exact: true }).click();
  await expect(
    page.getByText('לא ניתן לטעון את רשימת המשתמשים. יש לרענן את הרשימה.'),
  ).toBeVisible();
  await expect(page.getByText('עדיין אין עובדים רשומים.')).toHaveCount(0);
  await page.getByRole('button', { name: 'רענון רשימה' }).click();
  await expect(page.getByRole('row')).toHaveCount(21);
  await expect(page.getByText('1–20 מתוך 205')).toBeVisible();
  await page.getByRole('button', { name: /next page|לעמוד הבא/i }).click();
  await expect(page.getByText('21–40 מתוך 205')).toBeVisible();
  await page.getByLabel('חיפוש לפי שם או כתובת דוא״ל').fill('employee205@');
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(page.getByText('employee205@example.test')).toBeVisible();
});

test('manager requests a private visit and an invited employee accepts after boss approval', async ({
  page,
  browser,
}) => {
  const administrator = await browser.newContext({ baseURL: 'http://127.0.0.1:3191' });
  const boss = await browser.newContext({ baseURL: 'http://127.0.0.1:3191' });
  const invitee = await browser.newContext({ baseURL: 'http://127.0.0.1:3191' });
  const manager = await browser.newContext({ baseURL: 'http://127.0.0.1:3191' });
  await post(administrator, 'auth/admin', { username: 'admin', password: 'local-test-password' });
  await post(manager, 'auth/dev', { upn: 'noa@example.test' });
  await post(boss, 'auth/dev', { upn: 'uri@example.test' });
  await post(invitee, 'auth/dev', { upn: 'tamar@example.test' });
  const managerPerson = (await (await manager.request.get('/api/workspace')).json()).me;
  const bossPerson = (await (await boss.request.get('/api/workspace')).json()).me;
  await post(administrator, 'admin/role', { personId: managerPerson.id, role: 'manager' });
  await post(administrator, 'admin/role', { personId: bossPerson.id, role: 'boss' });
  await post(administrator, 'admin/supervisor', {
    personId: managerPerson.id,
    supervisorId: bossPerson.id,
  });
  await dev(page, 'noa');
  await page.getByRole('link', { name: 'חדר ישיבות', exact: true }).click();
  await page.getByRole('button', { name: 'הבא', exact: true }).click();
  await page.getByRole('button', { name: 'הוספת פגישה ' + future, exact: true }).click();
  await page.getByLabel('כותרת הפגישה').fill('ביקור צוות');
  await page.getByLabel('תיאור הפגישה').fill('תיאום ביקור');
  await page.getByLabel('שעת התחלה שעות').selectOption('17');
  await page.getByLabel('שעת התחלה דקות').selectOption('00');
  await page.getByLabel('שעת סיום שעות').selectOption('18');
  await page.getByLabel('שעת סיום דקות').selectOption('00');
  await page.getByLabel('פגישה פרטית').check();
  await page.getByLabel('פגישה במסגרת ביקור').check();
  const search = page.getByRole('combobox', { name: 'הזמנת משתתפים' });
  await search.fill('לאקיים');
  await expect(page.getByText('לא נמצאו משתמשים במערכת')).toBeVisible();
  await search.fill('תמר');
  await page.getByRole('option', { name: /תמר ברק/ }).click();
  await capture(page, 'meeting-form.png');
  await page.getByRole('button', { name: 'שליחת בקשת פגישה', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'בקשות והזמנות' })).toBeVisible();
  await expect(page.locator('section').filter({ hasText: 'ביקור צוות' })).toBeVisible();
  const bossPage = await boss.newPage();
  await bossPage.goto('/#requests');
  const requestCard = bossPage.locator('section').filter({ hasText: 'ביקור צוות' });
  await expect(requestCard).toBeVisible();
  await capture(bossPage, 'requests.png');
  await requestCard.getByRole('button', { name: 'אישור', exact: true }).click();
  await expect(requestCard).toHaveCount(0);
  const inviteePage = await invitee.newPage();
  await inviteePage.goto('/#requests');
  const inviteCard = inviteePage.locator('section').filter({ hasText: 'ביקור צוות' });
  await expect(inviteCard).toContainText('פגישת ביקור');
  await inviteCard.getByRole('button', { name: 'אישור הגעה' }).click();
  await expect(inviteCard).toHaveCount(0);
  await Promise.all([administrator.close(), boss.close(), invitee.close(), manager.close()]);
});

test('a boss creates, edits following occurrences, and deletes a recurring series', async ({
  page,
  browser,
}) => {
  const admin = await browser.newContext({ baseURL: 'http://127.0.0.1:3191' });
  const boss = await browser.newContext({ baseURL: 'http://127.0.0.1:3191' });
  await post(admin, 'auth/admin', { username: 'admin', password: 'local-test-password' });
  const destination = await post(admin, 'admin/rooms', { site: 'MARP', name: 'חדר סדרה' });
  await post(boss, 'auth/dev', { upn: 'uri@example.test' });
  let state = await (await boss.request.get('/api/workspace')).json();
  if (!state.me.site) await post(boss, 'onboarding', { site: 'MID' });
  await post(admin, 'admin/role', { personId: state.me.id, role: 'boss' });
  await dev(page, 'uri');
  await page.getByRole('link', { name: 'חדר ישיבות', exact: true }).click();
  await page.getByRole('button', { name: 'הבא', exact: true }).click();
  await page.getByRole('button', { name: 'הוספת פגישה ' + future, exact: true }).click();
  await page.getByLabel('כותרת הפגישה').fill('סדרת בדיקה');
  await page.getByLabel('תיאור הפגישה').fill('דיון חוזר');
  await page.getByLabel('שעת התחלה שעות').selectOption('11');
  await page.getByLabel('שעת התחלה דקות').selectOption('00');
  await page.getByLabel('שעת סיום שעות').selectOption('12');
  await page.getByLabel('שעת סיום דקות').selectOption('00');
  await page.getByLabel(/חזרה על הפגישה/).selectOption('weekly');
  await page.getByLabel('מספר הפגישות').fill('3');
  await page.getByRole('button', { name: 'הוספת פגישה', exact: true }).click();
  await expect(page.getByRole('button', { name: /סדרת בדיקה/ })).toBeVisible();
  await page.getByRole('button', { name: 'הבא', exact: true }).click();
  await page.getByRole('button', { name: /סדרת בדיקה/ }).click();
  await page.getByRole('button', { name: 'עריכת פגישה' }).click();
  await page.getByLabel('כותרת הפגישה').fill('סדרה מעודכנת');
  await page.getByLabel(/היקף השינוי/).selectOption('following');
  await page.getByRole('dialog').getByLabel(/חדר ישיבות/).selectOption(String(destination.id));
  await page.getByLabel('שעת התחלה שעות').selectOption('12');
  await page.getByLabel('שעת התחלה דקות').selectOption('00');
  await page.getByLabel('שעת סיום שעות').selectOption('13');
  await page.getByLabel('שעת סיום דקות').selectOption('00');
  await page.getByRole('button', { name: 'שמירת שינויים' }).click();
  await page.getByRole('button', { name: 'אישור השינוי' }).click();
  await page.getByRole('button', { name: /סדרה מעודכנת/ }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'ביטול כל הסדרה' }).click();
  await expect(page.getByRole('button', { name: /סדרה מעודכנת/ })).toHaveCount(0);
  state = await (await boss.request.get('/api/workspace')).json();
  expect(
    state.meetings.some((meeting: { title: string }) => meeting.title.includes('סדרה')),
  ).toBeFalsy();
  await Promise.all([admin.close(), boss.close()]);
});

test('meeting owners approve a swap and then a release through the requests page', async ({
  page,
  browser,
}) => {
  const admin = await browser.newContext({ baseURL: 'http://127.0.0.1:3191' });
  const firstOwner = await browser.newContext({ baseURL: 'http://127.0.0.1:3191' });
  const secondOwner = await browser.newContext({ baseURL: 'http://127.0.0.1:3191' });
  await post(admin, 'auth/admin', { username: 'admin', password: 'local-test-password' });
  await post(firstOwner, 'auth/dev', { upn: 'uri@example.test' });
  await post(secondOwner, 'auth/dev', { upn: 'tamar@example.test' });
  const firstState = await (await firstOwner.request.get('/api/workspace')).json();
  const secondState = await (await secondOwner.request.get('/api/workspace')).json();
  if (!firstState.me.site) await post(firstOwner, 'onboarding', { site: 'MID' });
  if (!secondState.me.site) await post(secondOwner, 'onboarding', { site: 'MID' });
  await post(admin, 'admin/role', { personId: firstState.me.id, role: 'boss' });
  await post(admin, 'admin/role', { personId: secondState.me.id, role: 'boss' });
  const roomId = firstState.rooms[0].id;
  const meetingInput = (from: string, until: string, title: string) => ({
    change: {
      action: 'create',
      roomId,
      date: sunday.toISODate(),
      from,
      until,
      title,
      description: 'תיאור',
    },
  });
  const first = await post(firstOwner, 'meetings', meetingInput('08:00', '09:00', 'החלפה ראשונה'));
  const second = await post(secondOwner, 'meetings', meetingInput('09:00', '10:00', 'החלפה שנייה'));
  await dev(page, 'uri');
  await page.getByRole('link', { name: 'חדר ישיבות', exact: true }).click();
  await page.getByRole('button', { name: 'הבא', exact: true }).click();
  await page.getByRole('button', { name: /החלפה שנייה/ }).click();
  await page.getByRole('button', { name: 'בקשה להחלפת פגישות' }).click();
  await page.getByLabel(/בחירת פגישה להחלפה/).selectOption(String(first.id));
  await page.getByRole('button', { name: 'שליחת בקשת החלפה' }).click();
  const approver = await secondOwner.newPage();
  await approver.goto('/#requests');
  const swap = approver.locator('section').filter({ hasText: 'בקשה להחלפת פגישות' });
  await swap.getByRole('button', { name: 'אישור', exact: true }).click();
  await expect(swap).toHaveCount(0);
  await page.goto('/#calendar');
  await page.getByRole('button', { name: 'הבא', exact: true }).click();
  await page.getByRole('button', { name: /החלפה שנייה/ }).click();
  await page.getByRole('button', { name: 'בקשה לשחרור החדר' }).click();
  await approver.reload();
  const release = approver.locator('section').filter({ hasText: 'בקשה לשחרור חדר' });
  await release.getByRole('button', { name: 'אישור', exact: true }).click();
  await expect(release).toHaveCount(0);
  const list = await (
    await firstOwner.request.get('/api/meetings?room=' + roomId + '&start=' + sunday.toISODate())
  ).json();
  expect(list.some((meeting: { id: number }) => meeting.id === second.id)).toBeFalsy();
  expect(list.some((meeting: { id: number }) => meeting.id === first.id)).toBeTruthy();
  await Promise.all([admin.close(), firstOwner.close(), secondOwner.close()]);
});
