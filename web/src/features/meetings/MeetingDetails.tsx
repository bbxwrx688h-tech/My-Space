import { Box, Button, NativeSelect, Typography } from '@mui/material';
import { Attendee, Meeting, Room } from '@shared/model';
import { clock, endClock, fullDate } from '@app/dates';
import { stackSx, rowSx, buttonSx, selectSx } from '@app/layout';
import { Field } from '@app/components/Fields';

export interface MeetingDetailsProps {
  meeting: Meeting;
  room: Room;
  attendees: Attendee[] | null;
  changeable: boolean;
  canEdit: boolean;
  busy: boolean;
  canExchange: boolean;
  canRelease: boolean;
  canSwap: boolean;
  swapOptions: Meeting[] | null;
  swapId: string;
  onSwapIdChange: (id: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onCancelFollowing: () => void;
  onCancelSeries: () => void;
  onRelease: () => void;
  onRequestSwap: () => void;
  onSubmitSwap: () => void;
}

export function MeetingDetails({
  meeting,
  room,
  attendees,
  changeable,
  canEdit,
  busy,
  canExchange,
  canRelease,
  canSwap,
  swapOptions,
  swapId,
  onSwapIdChange,
  onEdit,
  onCancel,
  onCancelFollowing,
  onCancelSeries,
  onRelease,
  onRequestSwap,
  onSubmitSwap,
}: MeetingDetailsProps) {
  return (
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
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1.5 }}>
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
              {{ pending: 'ממתין/ה לתשובה', accepted: 'אישר/ה', declined: 'דחה/תה' }[person.status]}
            </Typography>
          ))}
        </Box>
      )}
      {changeable && (
        <Box sx={{ ...rowSx, flexWrap: 'wrap' }}>
          {canEdit && (
            <Button sx={buttonSx} variant="contained" onClick={onEdit}>
              עריכת פגישה
            </Button>
          )}
          <Button sx={buttonSx} color="error" disabled={busy} onClick={onCancel}>
            ביטול פגישה
          </Button>
          {meeting.seriesId && (
            <>
              <Button sx={buttonSx} color="error" disabled={busy} onClick={onCancelFollowing}>
                ביטול פגישה זו והבאות
              </Button>
              <Button sx={buttonSx} color="error" disabled={busy} onClick={onCancelSeries}>
                ביטול כל הסדרה
              </Button>
            </>
          )}
        </Box>
      )}
      {canExchange && (
        <Box sx={stackSx}>
          {canRelease && (
            <Button sx={buttonSx} variant="outlined" disabled={busy} onClick={onRelease}>
              בקשה לשחרור החדר
            </Button>
          )}
          {canSwap && (
            <Button sx={buttonSx} variant="outlined" disabled={busy} onClick={onRequestSwap}>
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
                  onChange={(event) => onSwapIdChange(event.target.value)}
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
                disabled={!swapId || busy}
                onClick={onSubmitSwap}
              >
                שליחת בקשת החלפה
              </Button>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
