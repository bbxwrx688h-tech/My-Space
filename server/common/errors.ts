// Single source of the Hebrew copy shared by server-side error responses.
export const errors = {
  adminRequired: 'נדרשת הרשאת ניהול',
  requestNotFound: 'הבקשה לא נמצאה',
  requestNotPending: 'הבקשה כבר אינה ממתינה לאישור',
  meetingNotFound: 'הפגישה לא נמצאה',
  roomHeld: 'החדר שמור לבקשה הממתינה לאישור',
  contactAdmin: 'יש לפנות למנהל המערכת בנוגע לפגישה זו',
  inviteeNotFound: 'אחד המוזמנים לא נמצא במערכת',
} as const;
