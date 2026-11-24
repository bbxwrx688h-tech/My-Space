// Single source of the Hebrew copy used by all in-app notices.
export const messages = {
  meetingRequestExpired: 'בקשת הפגישה פגה ותפיסת החדר שוחררה.',
  meetingChangeRequestInvalidated: 'בקשת שינוי הפגישה בוטלה כי הפגישה המקורית הסתיימה או השתנתה.',
  exchangeRequestExpired: 'בקשת השחרור או ההחלפה פגה.',
  meetingRequestSubmitted: (requesterName: string, requesterSurname: string) =>
    `${requesterName} ${requesterSurname} שלח/ה בקשה להזמנת חדר ישיבות.`,
  meetingRequestRejected: 'בקשת הפגישה נדחתה ותפיסת החדר שוחררה.',
  meetingRequestCanceledAfterRoleChange: 'בקשת הפגישה בוטלה בגלל שינוי בתפקיד או בממונה.',
  meetingChangeRequestCanceledAfterOriginalChanged: 'בקשת השינוי בוטלה כי הפגישה המקורית השתנתה.',
  meetingChangeRequestCanceledAfterMeetingChanged: 'בקשת השינוי בוטלה כי אחת הפגישות השתנתה.',
  meetingRequestCanceledAfterScheduleChanged: 'בקשת הפגישה בוטלה כי לוח הפגישות השתנה.',
  meetingRequestCanceledAfterMeetingChanged: 'בקשת הפגישה בוטלה כי אחת הפגישות השתנתה.',
  meetingCanceledAfterApproval: 'הפגישה שלך בוטלה בעקבות בקשה שאושרה.',
  invitedToMeeting: (meetingTitle: string) => `הוזמנת לפגישה ״${meetingTitle}״.`,
  meetingUpdatedAfterRequestApproval: 'פגישה שלך עודכנה לאחר אישור בקשה.',
  meetingRequestApproved: 'בקשת הפגישה אושרה והפגישה נקבעה.',
  meetingInvitationCanceled: 'פגישה שהוזמנת אליה בוטלה.',
  meetingInvitationDetailsUpdated: 'פרטי פגישה שהוזמנת אליה עודכנו.',
  exchangeRequestCanceledAfterMeetingChanged: 'בקשת השחרור או ההחלפה בוטלה כי אחת הפגישות השתנתה.',
  roomReleaseRequested: 'התקבלה בקשה לשחרור חדר הישיבות של הפגישה שלך.',
  meetingSwapRequested: 'התקבלה בקשה להחלפת פגישות.',
  exchangeRequestRejected: 'בקשת השחרור או ההחלפה נדחתה.',
  exchangeRequestCanceledAfterDetailsChanged: 'הבקשה בוטלה כי פרטי הפגישה השתנו.',
  meetingInvitationTimeOrRoomChanged: 'מועד או חדר של פגישה שהוזמנת אליה השתנה.',
  meetingInvitationCanceledAfterRoomRelease: 'פגישה שהוזמנת אליה בוטלה לאחר אישור שחרור החדר.',
  meetingSwapRequestApproved: 'בקשת החלפת הפגישות אושרה והמועדים הוחלפו.',
  roomReleaseRequestApproved: 'בקשת השחרור אושרה והפגישה בוטלה.',
  meetingRequestCanceledByAdminBooking: 'בקשת הפגישה בוטלה בעקבות הזמנה של מנהל המערכת.',
  meetingCanceledAfterAnotherBooking: 'הפגישה שלך בוטלה בעקבות הזמנה אחרת.',
  meetingCanceledAfterSeriesChange: 'הפגישה שלך בוטלה בעקבות שינוי סדרה.',
  meetingSeriesUpdatedByAdmin: 'סדרת הפגישות שלך עודכנה על ידי מנהל/ת.',
  meetingCanceledByBooking: (meetingTitle: string, actorName: string, actorSurname: string) =>
    `הפגישה ״${meetingTitle}״ בוטלה עקב הזמנה של ${actorName} ${actorSurname}.`,
  meetingChangedBy: (
    meetingTitle: string,
    canceled: boolean,
    actorName: string,
    actorSurname: string,
  ) =>
    `הפגישה ״${meetingTitle}״ ${canceled ? 'בוטלה' : 'עודכנה'} על ידי ${actorName} ${actorSurname}.`,
  recurringMeetingInvitationDetailsUpdated: 'פרטי פגישה חוזרת שהוזמנת אליה עודכנו.',
  forwardedMeetingRequestCanceled: 'בקשת פגישה שהועברה לאישורך בוטלה.',
  meetingRequestCanceledByAdmin: 'בקשת הפגישה שלך בוטלה על ידי מנהל המערכת.',
  invitationResponded: (
    inviteeName: string,
    inviteeSurname: string,
    accepted: boolean,
    meetingTitle: string,
  ) =>
    `${inviteeName} ${inviteeSurname} ${accepted ? 'אישר/ה' : 'דחה/תה'} את ההזמנה לפגישה ״${meetingTitle}״.`,
  meetingSeriesInvitationCanceled: 'סדרת פגישות שהוזמנת אליה בוטלה.',
  meetingSeriesCanceledByAdmin: 'פגישות בסדרה שלך בוטלו על ידי מנהל/ת.',
  stationBookingCanceled: (room: string, site: string, date: string) =>
    `העמדה בחדר ${room} באתר ${site} הוסרה מתאריך ${date}. ההזמנה בוטלה.`,
  stationBooked: (
    employeeName: string,
    employeeSurname: string,
    room: string,
    site: string,
    dates: string[],
  ) =>
    `${employeeName} ${employeeSurname} הזמין/ה את העמדה בחדר ${room} באתר ${site} לתאריכים ${dates.join(', ')}.`,
} as const;
