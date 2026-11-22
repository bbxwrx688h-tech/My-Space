import { Box, Button, InputBase, NativeSelect, Typography } from '@mui/material';
import {
  stackSx,
  rowSx,
  pairSx,
  insetSx,
  warningSx,
  buttonSx,
  textInputSx,
  selectSx,
} from '../layout';
import { useEffect, useState } from 'react';
import { Meeting, Review, Workspace } from '../../../shared/model';
import { api, ApiError } from '../api';
import { clock, fullDate, local, now, nextMeetingSlot } from '../dates';
import { DateField, ErrorLine, Field, Modal, useAction } from './Fields';

const slots = Array.from(
  { length: 96 },
  (_, i) =>
    String(Math.floor(i / 4)).padStart(2, '0') + ':' + String((i % 4) * 15).padStart(2, '0'),
);
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
  saved: (date?: string) => Promise<void>;
}) {
  const [initial] = useState(() => nextMeetingSlot(initialDate));
  const [editing, setEditing] = useState(!meeting);
  const [date, setDate] = useState(meeting ? local(meeting.start).toISODate()! : initial.date);
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
  const [pending, setPending] = useState<{ review: Review; change: Change; ready: number } | null>(
    null,
  );
  const [seconds, setSeconds] = useState(0);
  const action = useAction();
  const room = data.rooms.find((r) => r.id === roomId)!;
  const changeable =
    meeting &&
    (data.me.id === meeting.organizerId || data.me.role === 'boss') &&
    local(meeting.end) > now();
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
        await api('meetings', { change, token });
      } catch (e) {
        if (e instanceof ApiError && e.review) {
          setSeconds(e.review.waitSeconds);
          setPending({ change, review: e.review, ready: Date.now() + e.review.waitSeconds * 1000 });
          return;
        }
        throw e;
      }
      await saved(typeof change.date === 'string' ? change.date : undefined);
      close();
    });
  }
  const target = meeting ? { meetingId: meeting.id, version: meeting.version } : {};
  const modalTitle = pending
    ? 'אישור שינוי בפגישות'
    : editing
      ? meeting
        ? 'עריכת פגישה'
        : 'פגישה חדשה'
      : 'פרטי הפגישה';
  return (
    <Modal title={modalTitle} close={close}>
      <ErrorLine error={action.error} />
      {pending ? (
        <Box sx={stackSx}>
          <Typography variant="body1">
            {pending.change.action === 'create'
              ? 'ההזמנה החדשה תבטל את הפגישות הבאות במלואן.'
              : 'הפעולה תשנה או תבטל את הפגישות המפורטות להלן.'}
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
                  {clock(m.start)}–{clock(m.end)}
                </bdi>
              </Typography>
              {m.role === 'boss' && m.organizerId !== data.me.id && (
                <Typography variant="body1" sx={warningSx}>
                  הפגישה הוזמנה על ידי {m.organizer}. כדי להזמין את החדר במועד הזה, יש ליצור קשר עם{' '}
                  {m.organizer} לפני האישור.
                </Typography>
              )}
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
              roomId,
              ...target,
              date,
              from,
              until,
              title,
              description,
            });
          }}
        >
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            {room.name} · {room.site} · שעון ירושלים
          </Typography>
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
            max={data.me.role === 'boss' ? undefined : now().plus({ months: 1 }).toISODate()!}
            workdaysOnly
            onChange={(day) => {
              setDate(day);
              if (day === now().toISODate() && from <= now().toFormat('HH:mm')) {
                const next = nextMeetingSlot(day);
                setDate(next.date);
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
          <Button sx={buttonSx} variant="contained" type="submit" disabled={action.busy}>
            {meeting ? 'שמירת שינויים' : 'הוספת פגישה'}
          </Button>
        </Box>
      ) : (
        meeting && (
          <Box sx={stackSx}>
            <Typography variant="h3">{meeting.title}</Typography>
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
                  {clock(meeting.start)}–{clock(meeting.end)}
                </bdi>
              </Typography>
            </Box>
            {changeable && (
              <Box sx={rowSx}>
                <Button sx={buttonSx} variant="contained" onClick={() => setEditing(true)}>
                  עריכת פגישה
                </Button>
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
              </Box>
            )}
          </Box>
        )
      )}
    </Modal>
  );
}

function TimeField({
  label,
  value,
  min,
  end,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  end?: boolean;
  onChange: (value: string) => void;
}) {
  const options = end ? [...slots.slice(1), '24:00'] : slots;
  const allowed = options.filter((time) => !min || time > min);
  const [hour, minute] = value.split(':');
  const hours = [...new Set(allowed.map((time) => time.slice(0, 2)))];
  return (
    <Box role="group" aria-label={label}>
      <Typography sx={{ fontWeight: 600, fontSize: '.94rem', mb: '6px' }}>{label}</Typography>
      <Box sx={{ display: 'flex', gap: 1 }} dir="ltr">
        <NativeSelect
          disableUnderline
          inputProps={{ 'aria-label': label + ' שעות' }}
          sx={selectSx}
          value={hour}
          onChange={(event) => {
            const next =
              allowed.find((time) => time === event.target.value + ':' + minute) ||
              allowed.find((time) => time.startsWith(event.target.value + ':'));
            if (next) onChange(next);
          }}
        >
          {!hours.includes(hour) && (
            <option value={hour} disabled>
              {hour}
            </option>
          )}
          {hours.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          disableUnderline
          inputProps={{ 'aria-label': label + ' דקות' }}
          sx={selectSx}
          value={minute}
          onChange={(event) => onChange(hour + ':' + event.target.value)}
        >
          {['00', '15', '30', '45'].map((m) => (
            <option key={m} value={m} disabled={!allowed.includes(hour + ':' + m)}>
              {m}
            </option>
          ))}
        </NativeSelect>
      </Box>
    </Box>
  );
}
