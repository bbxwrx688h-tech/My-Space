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
  await page.getByLabel('יש לי עמדה', { exact: true }).check();
  await page.getByLabel('מספר חדר').fill('204');
  await page.getByLabel('תיאור העמדה').fill('עמדה ליד החלון');
  await page.getByRole('button', { name: 'המשך לסביבת העבודה' }).click();
  await expect(page.getByRole('heading', { name: 'שלום, נועה' })).toBeVisible();
  await page.getByRole('link', { name: 'לבחירת עמדה' }).click();
  await page.getByRole('button', { name: 'פרסום הצעה' }).click();
  const publish = page.getByRole('dialog', { name: 'פרסום הצעה' });
  await selectDate(page, 'עד תאריך', today.plus({ days: 4 }));
  await publish.getByRole('button', { name: 'פרסום הצעה' }).click();
  await expect(publish).toHaveCount(0);
  await expect(
    page.getByRole('article').getByText('עמדה ליד החלון', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'חדר ישיבות', exact: true }).click();
  await page.getByRole('button', { name: 'הוספת פגישה ' + future, exact: true }).click();
  await page.getByLabel('כותרת הפגישה').fill('תכנון שבועי');
  await page.getByLabel('תיאור הפגישה').fill('חלוקת משימות לצוות');
  await page.getByRole('button', { name: 'הוספת פגישה', exact: true }).click();
  await page.getByRole('button', { name: /תכנון שבועי/ }).click();
  await expect(page.getByText('חלוקת משימות לצוות')).toBeVisible();
  await page.getByRole('button', { name: 'עריכת פגישה' }).click();
  await page.getByLabel('שעת סיום').selectOption('10:30');
  await page.getByRole('button', { name: 'שמירת שינויים' }).click();
  await expect(page.getByRole('button', { name: /09:00–10:30/ })).toBeVisible();
  await page.getByRole('button', { name: 'הבא', exact: true }).click();
  await expect(page.getByRole('button', { name: /תכנון שבועי/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'היום', exact: true }).click();
  await expect(page.getByRole('button', { name: /תכנון שבועי/ })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'ניהול הזמנה' })).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'ההצעות שלי' })).toBeVisible();
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

test('admin manages roles and a boss explicitly confirms a protected override after the countdown', async ({
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
  await page.getByRole('button', { name: 'החשבון שלי' }).click();
  await page.getByLabel(/אורי כהן/).selectOption('boss');
  await expect(page.getByLabel(/תמר ברק/)).toBeEnabled();
  await page.getByLabel(/תמר ברק/).selectOption('boss');
  await expect(page.getByLabel(/אורי כהן/)).toBeEnabled();
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
  await page.getByRole('button', { name: 'הוספת פגישה ' + future, exact: true }).click();
  await page.getByLabel('כותרת הפגישה').fill('דיון חלופי');
  await page.getByLabel('תיאור הפגישה').fill('דיון המשך');
  await page.getByLabel('שעת התחלה').selectOption('15:15');
  await page.getByLabel('שעת סיום').selectOption('15:45');
  await page.getByRole('button', { name: 'הוספת פגישה', exact: true }).click();
  await expect(page.getByText(/יש ליצור קשר עם אורי כהן/)).toBeVisible();
  await expect(page.getByRole('button', { name: /אישור בעוד/ })).toBeDisabled();
  await page.getByRole('button', { name: 'אישור השינוי', exact: true }).click({ timeout: 9000 });
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
    days: [today.toISODate()],
  });
  await page.reload();
  await page
    .getByRole('article')
    .filter({ hasText: 'שולחן ליד הדלת הירוקה' })
    .getByRole('button', { name: 'ניהול ההצעה' })
    .click();
  await page.getByRole('checkbox', { name: /העמדה מוזמנת/ }).check();
  await page.getByRole('button', { name: 'אישור הסרה (1)' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = await (await borrower.request.get('/api/workspace')).json();
  expect(after.offers.find((o: { id: number }) => o.id === offer.id).days).toEqual([
    { date: today.plus({ days: 1 }).toISODate(), status: 'available' },
  ]);
  expect(after.notices.some((n: { message: string }) => n.message.includes('42'))).toBeTruthy();
  await borrower.close();
});
