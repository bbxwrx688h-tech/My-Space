import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  InputBase,
  NativeSelect,
  Typography,
} from '@mui/material';
import { stackSx, rowSx, pairSx, insetSx, buttonSx, textInputSx, selectSx } from '../layout';
import { useEffect, useState } from 'react';
import { Attendee, DirectoryPerson, Meeting, Review, Workspace } from '../../../shared/model';
import { api, ApiError } from '../api';
import { clock, endClock, fullDate, local, now, nextMeetingSlot } from '../dates';
import { DateField, ErrorLine, Field, Modal, useAction } from './Fields';
import { InviteePicker } from './InviteePicker';
import { slots, TimeField } from './MeetingTimeField';

type Change = Record<string, unknown>;
export function MeetingDialog({
  data,
  roomId,
  meeting,
  initialDate,
  close,
  saved,
}: {
  data: Workspace;
  roomId: number;
  meeting?: Meeting;
  initialDate?: string;
  close: () => void;
  saved: (date?: string, selectedRoomId?: number) => Promise<void>;
}) {
  const [initial] = useState(() => nextMeetingSlot(initialDate));
  const [editing, setEditing] = useState(!meeting);
  const [date, setDate] = useState(meeting ? local(meeting.start).toISODate()! : initial.date);
  const [selectedRoomId, setSelectedRoomId] = useState(roomId);
  const [from, setFrom] = useState(meeting ? clock(meeting.start) : initial.from);
  const [until, setUntil] = useState(
    meeting
      ? local(meeting.end).toISODate() !== date
        ? '24:00'
        : clock(meeting.end)
      : initial.until,
  );
  const [title, setTitle] = useState(meeting?.title || '');
  const [description, setDescription] = useState(meeting?.description || '');
  const [isPrivate, setPrivate] = useState(!!meeting?.private);
  const [visit, setVisit] = useState(!!meeting?.visit);
  const [invitees, setInvitees] = useState<DirectoryPerson[]>([]);
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [attendeesLoaded, setAttendeesLoaded] = useState(!meeting || !!meeting.pending);
  const [attendeesLoadFailed, setAttendeesLoadFailed] = useState(false);
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly'>('none');
  const [editScope, setEditScope] = useState<'single' | 'following'>('single');
  const [recurrenceEnd, setRecurrenceEnd] = useState<'count' | 'date'>('count');
  const [count, setCount] = useState(4);
  const [endDate, setEndDate] = useState(date);
  const [swapOptions, setSwapOptions] = useState<Meeting[] | null>(null);
  const [swapId, setSwapId] = useState('');
  const [pending, setPending] = useState<{ review: Review; change: Change; ready: number } | null>(
    null,
  );
  const [seconds, setSeconds] = useState(0);
  const action = useAction();
  const room = data.rooms.find((r) => r.id === roomId)!;
  const changeable =
    meeting &&
    !meeting.pending &&
    local(meeting.end) > now() &&
    (data.me.id === meeting.organizerId ||
      data.me.role === 'admin' ||
      (data.me.role === 'boss' &&
        meeting.role === 'manager' &&
        meeting.ownerSupervisorId === data.me.id));
  const canEdit = changeable && data.me.role !== 'user';
  useEffect(() => {
    if (!meeting || meeting.pending) return;
    let current = true;
    api<Attendee[]>('meetings/attendees?meeting=' + meeting.id)
      .then((list) => {
        if (current) {
          setAttendees(list);
          setInvitees(list);
        }
      })
      .catch((error: Error) => {
        if (current && !(error instanceof ApiError && error.status === 403)) {
          setAttendeesLoadFailed(true);
        }
      })
      .finally(() => {
        if (current) setAttendeesLoaded(true);
      });
    return () => {
      current = false;
    };
  }, [meeting?.id]);
  useEffect(() => {
    if (!pending) return;
    const tick = () => setSeconds(Math.max(0, Math.ceil((pending.ready - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [pending]);
  async function submit(change: Change, token?: string) {
    await action.run(async () => {
      try {
        const result = await api<{ pending?: boolean }>('meetings', { change, token });
        if (result.pending) {
          await saved(
            typeof change.date === 'string' ? change.date : undefined,
            typeof change.roomId === 'number' ? change.roomId : undefined,
          );
          close();
          location.hash = 'requests';
          return;
        }
      } catch (e) {
        if (e instanceof ApiError && e.review) {
          setSeconds(e.review.waitSeconds);
          setPending({ change, review: e.review, ready: Date.now() + e.review.waitSeconds * 1000 });
          return;
        }
        throw e;
      }
      await saved(
        typeof change.date === 'string' ? change.date : undefined,
        typeof change.roomId === 'number' ? change.roomId : undefined,
      );
      close();
    });
  }
  const target = meeting ? { meetingId: meeting.id, version: meeting.version } : {};
  const modalTitle = pending
    ? 'אישור שינוי בפגישות'
    : editing
      ? meeting
        ? 'עריכת פגישה'
        : data.me.role === 'manager'
          ? 'בקשה להזמנת חדר'
          : 'פגישה חדשה'
      : 'פרטי הפגישה';
  return (
    <Modal title={modalTitle} close={close}>
      <ErrorLine error={action.error} />
      {pending ? (
        <Box sx={stackSx}>
          <Typography variant="body1">
            הפעולה תשנה או תבטל את הפגישות והבקשות המפורטות להלן.
          </Typography>
          {pending.review.affected.map((m) => (
            <Box sx={insetSx} key={m.id}>
              <strong>{m.title}</strong>
              <Typography
                variant="body1"
                component="p"
                sx={{ fontSize: '.94rem', color: 'text.secondary', mt: '5px' }}
              >
                {m.organizer} · {fullDate(m.start)} ·{' '}
                <bdi>
                  {clock(m.start)}–{endClock(m.start, m.end)}
                </bdi>
              </Typography>
            </Box>
          ))}
          <Box sx={rowSx}>
            <Button
              sx={buttonSx}
              variant="contained"
              disabled={seconds > 0 || action.busy}
              onClick={() => submit(pending.change, pending.review.token)}
            >
              {seconds ? 'אישור בעוד ' + seconds + ' שניות' : 'אישור השינוי'}
            </Button>
            <Button sx={buttonSx} onClick={() => setPending(null)}>
              חזרה
            </Button>
          </Box>
        </Box>
      ) : editing ? (
        <Box
          component="form"
          sx={stackSx}
          onSubmit={(e) => {
            e.preventDefault();
            void submit({
              action: meeting ? 'edit' : 'create',
              roomId: selectedRoomId,
              ...target,
              date,
              from,
              until,
              title,
              description,
              private: isPrivate,
              visit,
              invitees: invitees.map((person) => person.id),
              ...(meeting ? { scope: editScope } : {}),
              ...(!meeting && recurrence !== 'none'
                ? {
                    recurrence: {
                      frequency: recurrence,
                      ...(recurrenceEnd === 'count' ? { count } : { endDate }),
                    },
                  }
                : {}),
            });
          }}
        >
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            שעון ירושלים
          </Typography>
          <Field label="חדר ישיבות">
            <NativeSelect
              disableUnderline
              sx={selectSx}
              value={selectedRoomId}
              onChange={(event) => setSelectedRoomId(Number(event.target.value))}
            >
              {data.rooms.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} · {option.site}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="כותרת הפגישה">
            <InputBase
              inputProps={{ maxLength: 150 }}
              sx={textInputSx}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <DateField
            label="תאריך הפגישה"
            value={date}
            min={now().toISODate()!}
            max={data.me.role === 'manager' ? now().plus({ weeks: 2 }).toISODate()! : undefined}
            workdaysOnly
            onChange={(day) => {
              setDate(day);
              if (endDate < day) setEndDate(day);
              if (day === now().toISODate() && from <= now().toFormat('HH:mm')) {
                const next = nextMeetingSlot(day);
                setDate(next.date);
                setEndDate((previous) => (previous < next.date ? next.date : previous));
                setFrom(next.from);
                setUntil(next.until);
              }
            }}
          />
          <Box sx={pairSx}>
            <TimeField
              label="שעת התחלה"
              value={from}
              min={date === now().toISODate() ? now().toFormat('HH:mm') : undefined}
              onChange={(value) => {
                setFrom(value);
                if (until <= value) setUntil(slots[slots.indexOf(value) + 1] || '24:00');
              }}
            />
            <TimeField label="שעת סיום" value={until} min={from} end onChange={setUntil} />
          </Box>
          <Field label="תיאור הפגישה">
            <InputBase
              multiline
              minRows={3}
              inputProps={{ maxLength: 2000 }}
              sx={textInputSx}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <FormControlLabel
            control={
              <Checkbox
                checked={isPrivate}
                onChange={(event) => setPrivate(event.target.checked)}
              />
            }
            label="פגישה פרטית"
          />
          <FormControlLabel
            control={
              <Checkbox checked={visit} onChange={(event) => setVisit(event.target.checked)} />
            }
            label="פגישה במסגרת ביקור"
          />
          {meeting?.seriesId && (data.me.role === 'boss' || data.me.role === 'admin') && (
            <Box sx={stackSx}>
              <Field label="היקף השינוי">
                <NativeSelect
                  disableUnderline
                  sx={selectSx}
                  value={editScope}
                  onChange={(event) => setEditScope(event.target.value as typeof editScope)}
                >
                  <option value="single">פגישה זו בלבד</option>
                  <option value="following">פגישה זו והבאות בסדרה</option>
                </NativeSelect>
              </Field>
              {editScope === 'following' && <Typography color="text.secondary">פרטי הטופס יחולו על הפגישה הזו ועל הפגישות הבאות בסדרה.</Typography>}
            </Box>
          )}
          <InviteePicker value={invitees} onChange={setInvitees} />
          {attendeesLoadFailed && (
            <ErrorLine error="לא ניתן לטעון את המוזמנים. יש לסגור את הפגישה ולפתוח אותה מחדש." />
          )}
          {!meeting && (data.me.role === 'boss' || data.me.role === 'admin') && (
            <Box sx={stackSx}>
              <Field label="חזרה על הפגישה">
                <NativeSelect
                  disableUnderline
                  sx={selectSx}
                  value={recurrence}
                  onChange={(event) => setRecurrence(event.target.value as typeof recurrence)}
                >
                  <option value="none">ללא חזרה</option>
                  <option value="daily">ימי עבודה</option>
                  <option value="weekly">כל שבוע</option>
                </NativeSelect>
              </Field>
              {recurrence !== 'none' && (
                <>
                  <Field label="סיום הסדרה">
                    <NativeSelect
                      disableUnderline
                      sx={selectSx}
                      value={recurrenceEnd}
                      onChange={(event) =>
                        setRecurrenceEnd(event.target.value as typeof recurrenceEnd)
                      }
                    >
                      <option value="count">לפי מספר פגישות</option>
                      <option value="date">לפי תאריך</option>
                    </NativeSelect>
                  </Field>
                  {recurrenceEnd === 'count' ? (
                    <Field label="מספר הפגישות">
                      <InputBase
                        type="number"
                        required
                        sx={textInputSx}
                        inputProps={{ min: 1 }}
                        value={count}
                        onChange={(event) => setCount(Number(event.target.value))}
                      />
                    </Field>
                  ) : (
                    <DateField
                      label="תאריך סיום הסדרה"
                      value={endDate}
                      min={date}
                      onChange={setEndDate}
                    />
                  )}
                </>
              )}
            </Box>
          )}
          <Button
            sx={buttonSx}
            variant="contained"
            type="submit"
            disabled={action.busy || !attendeesLoaded || attendeesLoadFailed}
          >
            {meeting
              ? 'שמירת שינויים'
              : data.me.role === 'manager'
                ? 'שליחת בקשת פגישה'
                : 'הוספת פגישה'}
          </Button>
        </Box>
      ) : (
        meeting && (
          <Box sx={stackSx}>
            <Typography variant="h3">{meeting.title}</Typography>
            {meeting.pending && <Typography color="text.secondary">ממתינה לאישור</Typography>}
            {meeting.private && <Typography color="text.secondary">פגישה פרטית</Typography>}
            {meeting.visit && <Typography color="text.secondary">פגישה במסגרת ביקור</Typography>}
            <Typography
              variant="body1"
              component="p"
              sx={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
            >
              {meeting.description}
            </Typography>
            <Box
              component="dl"
              sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1.5 }}
            >
              <Typography variant="inherit" component="dt" sx={{ color: 'text.secondary' }}>
                מארגן/ת
              </Typography>
              <Typography variant="inherit" component="dd" sx={{ m: 0, fontWeight: 700 }}>
                {meeting.organizer}
              </Typography>
              <Typography variant="inherit" component="dt" sx={{ color: 'text.secondary' }}>
                חדר
              </Typography>
              <Typography variant="inherit" component="dd" sx={{ m: 0, fontWeight: 700 }}>
                {room.name} · {room.site}
              </Typography>
              <Typography variant="inherit" component="dt" sx={{ color: 'text.secondary' }}>
                מועד
              </Typography>
              <Typography variant="inherit" component="dd" sx={{ m: 0, fontWeight: 700 }}>
                {fullDate(meeting.start)} ·{' '}
                <bdi>
                  {clock(meeting.start)}–{endClock(meeting.start, meeting.end)}
                </bdi>
              </Typography>
            </Box>
            {!!attendees?.length && (
              <Box>
                <Typography variant="h3">מוזמנים</Typography>
                {attendees.map((person) => (
                  <Typography key={person.id}>
                    {person.name} {person.surname} ·{' '}
                    {
                      { pending: 'ממתין/ה לתשובה', accepted: 'אישר/ה', declined: 'דחה/תה' }[
                        person.status
                      ]
                    }
                  </Typography>
                ))}
              </Box>
            )}
            {changeable && (
              <Box sx={{ ...rowSx, flexWrap: 'wrap' }}>
                {canEdit && (
                  <Button sx={buttonSx} variant="contained" onClick={() => setEditing(true)}>
                    עריכת פגישה
                  </Button>
                )}
                <Button
                  sx={buttonSx}
                  color="error"
                  disabled={action.busy}
                  onClick={() => {
                    if (meeting.organizerId !== data.me.id || window.confirm('לבטל את הפגישה?'))
                      void submit({ action: 'cancel', roomId, ...target });
                  }}
                >
                  ביטול פגישה
                </Button>
                {meeting.seriesId && (
                  <>
                    <Button
                      sx={buttonSx}
                      color="error"
                      disabled={action.busy}
                      onClick={() => {
                        if (!window.confirm('לבטל את הפגישה הזו ואת הפגישות הבאות בסדרה?')) return;
                        void action.run(async () => {
                          await api('meetings/series/cancel', {
                            seriesId: meeting.seriesId,
                            fromMeetingId: meeting.id,
                          });
                          await saved();
                          close();
                        });
                      }}
                    >
                      ביטול פגישה זו והבאות
                    </Button>
                    <Button
                      sx={buttonSx}
                      color="error"
                      disabled={action.busy}
                      onClick={() => {
                        if (!window.confirm('לבטל את כל הפגישות בסדרה?')) return;
                        void action.run(async () => {
                          await api('meetings/series/cancel', { seriesId: meeting.seriesId });
                          await saved();
                          close();
                        });
                      }}
                    >
                      ביטול כל הסדרה
                    </Button>
                  </>
                )}
              </Box>
            )}
            {!meeting.pending && data.me.role !== 'user' && local(meeting.start) > now() && (
              <Box sx={stackSx}>
                {meeting.organizerId !== data.me.id && (
                  <Button
                    sx={buttonSx}
                    variant="outlined"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await api('meetings/exchange', { kind: 'release', meetingId: meeting.id });
                        await saved();
                        close();
                        location.hash = 'requests';
                      })
                    }
                  >
                    בקשה לשחרור החדר
                  </Button>
                )}
                {(data.me.role === 'admin' || meeting.role !== 'user') && (
                  <Button
                    sx={buttonSx}
                    variant="outlined"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        const upcoming = await api<Meeting[]>('meetings/upcoming');
                        setSwapOptions(
                          upcoming.filter(
                            (candidate) =>
                              candidate.id !== meeting.id &&
                              (data.me.role === 'admin' || candidate.role !== 'user'),
                          ),
                        );
                      })
                    }
                  >
                    בקשה להחלפת פגישות
                  </Button>
                )}
                {swapOptions && (
                  <>
                    <Field label="בחירת פגישה להחלפה">
                      <NativeSelect
                        disableUnderline
                        sx={selectSx}
                        value={swapId}
                        onChange={(event) => setSwapId(event.target.value)}
                      >
                        <option value="">בחירת פגישה</option>
                        {swapOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.title} · {option.organizer} · {fullDate(option.start)}{' '}
                            {clock(option.start)}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    {!swapOptions.length && (
                      <Typography color="text.secondary">אין פגישות זמינות להחלפה.</Typography>
                    )}
                    <Button
                      sx={buttonSx}
                      variant="contained"
                      disabled={!swapId || action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          await api('meetings/exchange', {
                            kind: 'swap',
                            meetingId: meeting.id,
                            otherMeetingId: Number(swapId),
                          });
                          await saved();
                          close();
                          location.hash = 'requests';
                        })
                      }
                    >
                      שליחת בקשת החלפה
                    </Button>
                  </>
                )}
              </Box>
            )}
          </Box>
        )
      )}
    </Modal>
  );
}
