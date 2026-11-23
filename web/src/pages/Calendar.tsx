import { Box, Button, ButtonBase, NativeSelect, Typography } from '@mui/material';
import { rowSx, panelSx, filterBarSx, pageHeadingSx, buttonSx, selectSx } from '../layout';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Meeting, Workspace } from '../../../shared/model';
import { api } from '../api';
import { clock, endClock, fullDate, local, now, shortDate, sunday } from '../dates';
import { ErrorLine, Field } from '../components/Fields';
import { MeetingDialog } from '../components/MeetingDialog';

export function Calendar({ data, saved }: { data: Workspace; saved: () => Promise<void> }) {
  const [start, setStart] = useState(() => sunday().toISODate()!);
  const [roomId, setRoom] = useState(
    data.rooms.find((r) => r.site === data.me.site)?.id || data.rooms[0].id,
  );
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ date?: string; meeting?: Meeting } | null>(null);
  useEffect(() => {
    let current = true;
    api<Meeting[]>('meetings?room=' + roomId + '&start=' + start)
      .then((list) => {
        if (current) {
          setMeetings(list);
          setError('');
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [start, roomId, data]);
  const first = local(start);
  // Managers can request dates within two weeks; bosses and admins have no limit.
  const lastAllowed =
    data.me.role === 'manager' ? now().plus({ weeks: 2 }).toISODate()! : undefined;
  const canRequest = data.me.role !== 'user';
  function navigate(days: number) {
    setMeetings([]);
    setStart(first.plus({ days }).toISODate()!);
  }
  return (
    <>
      <Box component="header" sx={pageHeadingSx}>
        <Box>
          <Typography variant="h1">חדר ישיבות</Typography>
        </Box>
        {canRequest && (
          <Button
            sx={buttonSx}
            variant="contained"
            disabled={!!lastAllowed && start > lastAllowed}
            startIcon={<Plus />}
            onClick={() =>
              setDialog({ date: start > now().toISODate()! ? start : now().toISODate()! })
            }
          >
            {data.me.role === 'manager' ? 'בקשת פגישה' : 'פגישה חדשה'}
          </Button>
        )}
      </Box>
      <Box sx={filterBarSx}>
        <Field label="חדר ישיבות">
          <NativeSelect
            disableUnderline
            sx={selectSx}
            value={roomId}
            onChange={(e) => {
              setMeetings([]);
              setRoom(Number(e.target.value));
            }}
          >
            {data.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.site}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Box sx={{ ...rowSx, alignSelf: 'center' }}>
          <Button
            sx={buttonSx}
            disabled={start <= sunday().toISODate()!}
            onClick={() => navigate(-7)}
          >
            הקודם
          </Button>
          <Button
            sx={buttonSx}
            disabled={!!lastAllowed && first.plus({ days: 7 }).toISODate()! > lastAllowed}
            onClick={() => navigate(7)}
          >
            הבא
          </Button>
        </Box>
        <Box component="bdi" sx={{ marginInlineStart: 'auto', alignSelf: 'center' }}>
          {shortDate(start)} – {shortDate(first.plus({ days: 6 }).toISODate()!)}
        </Box>
      </Box>
      <ErrorLine error={error} />
      {[0].map((offset) => (
        <Box
          component="section"
          key={offset}
          aria-label={'שבוע ' + (offset ? 2 : 1)}
          sx={{ ...panelSx, mt: 2, p: 0, overflow: 'auto', maxHeight: '60vh' }}
        >
          <Box
            sx={{
              minWidth: 680,
              display: 'grid',
              gridTemplateColumns: '60px repeat(5,minmax(120px,1fr))',
            }}
          >
            <Box />
            {Array.from({ length: 5 }, (_, i) => {
              const day = first.plus({ days: offset + i }).toISODate()!;
              const canBook =
                canRequest && day >= now().toISODate()! && (!lastAllowed || day <= lastAllowed);
              return (
                <Box
                  key={day}
                  sx={{
                    p: 1,
                    textAlign: 'center',
                    borderInlineStart: '1px solid',
                    borderColor: 'divider',
                    bgcolor: day === now().toISODate() ? 'action.selected' : undefined,
                  }}
                >
                  <Typography variant="h3" sx={{ fontSize: '.95rem' }}>
                    {fullDate(day)}
                  </Typography>
                  {canBook && (
                    <ButtonBase
                      aria-label={'הוספת פגישה ' + shortDate(day)}
                      onClick={() => setDialog({ date: day })}
                      sx={{ mt: 0.5, color: 'primary.main' }}
                    >
                      <Plus size={18} />
                    </ButtonBase>
                  )}
                </Box>
              );
            })}
            <Box
              sx={{
                position: 'relative',
                height: 24 * 48,
                borderTop: '1px solid',
                borderColor: 'divider',
              }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <Box
                  key={h}
                  sx={{
                    height: 48,
                    textAlign: 'center',
                    fontSize: '.8rem',
                    color: 'text.secondary',
                  }}
                >
                  {String(h).padStart(2, '0')}:00
                </Box>
              ))}
            </Box>
            {Array.from({ length: 5 }, (_, i) => {
              const day = first.plus({ days: offset + i }).toISODate()!;
              return (
                <Box
                  key={day}
                  sx={{
                    position: 'relative',
                    height: 24 * 48,
                    borderInlineStart: '1px solid',
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    backgroundImage:
                      'repeating-linear-gradient(to bottom, transparent 0, transparent 47px, rgba(65,90,119,.23) 47px, rgba(65,90,119,.23) 48px)',
                  }}
                >
                  {day === now().toISODate() && (
                    <Box
                      aria-label="השעה הנוכחית"
                      sx={{
                        position: 'absolute',
                        top: (now().hour * 60 + now().minute) * 0.8,
                        insetInline: 0,
                        borderTop: '2px solid',
                        borderColor: 'error.main',
                        zIndex: 1,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  {meetings
                    .filter((m) => local(m.start).toISODate() === day)
                    .map((m) => {
                      const begin = local(m.start);
                      const end = local(m.end);
                      // The grid is wall-clock time, including on daylight-saving transitions.
                      const duration =
                        end.hour * 60 +
                        end.minute +
                        (end.toISODate() !== begin.toISODate() ? 1440 : 0) -
                        begin.hour * 60 -
                        begin.minute;
                      return (
                        <ButtonBase
                          key={m.id}
                          onClick={() => setDialog({ meeting: m })}
                          sx={{
                            position: 'absolute',
                            top: (begin.hour * 60 + begin.minute) * 0.8,
                            height: duration * 0.8,
                            insetInline: 3,
                            display: 'block',
                            textAlign: 'start',
                            overflow: 'hidden',
                            p: 0.5,
                            borderRadius: 1,
                            bgcolor: m.pending ? 'secondary.main' : 'primary.main',
                            color: 'primary.contrastText',
                            fontSize: '.8rem',
                          }}
                        >
                          <strong>
                            {m.title}
                            {m.pending ? ' · ממתינה לאישור' : ''}
                          </strong>
                          <br />
                          <bdi>
                            {clock(m.start)}–{endClock(m.start, m.end)}
                          </bdi>
                        </ButtonBase>
                      );
                    })}
                </Box>
              );
            })}
          </Box>
        </Box>
      ))}
      {dialog && (
        <MeetingDialog
          data={data}
          roomId={roomId}
          meeting={dialog.meeting}
          initialDate={dialog.date}
          close={() => setDialog(null)}
          saved={async (date, selectedRoomId) => {
            if (selectedRoomId && selectedRoomId !== roomId) setRoom(selectedRoomId);
            // Bring a newly booked date into view even if the form was opened
            // from a different week.
            if (date && (date < start || date >= first.plus({ days: 7 }).toISODate()!)) {
              const selected = local(date);
              setStart(selected.minus({ days: selected.weekday % 7 }).toISODate()!);
            }
            await saved();
          }}
        />
      )}
    </>
  );
}
