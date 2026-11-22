import { Box, Button, ButtonBase, NativeSelect, Typography } from '@mui/material';
import {
  rowSx,
  panelSx,
  filterBarSx,
  pageHeadingSx,
  subtitleSx,
  buttonSx,
  selectSx,
} from '../layout';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Meeting, Workspace } from '../../../shared/model';
import { api } from '../api';
import { clock, fullDate, local, now, shortDate, sunday } from '../dates';
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
  const lastAllowed = data.me.role === 'boss' ? undefined : now().plus({ months: 1 }).toISODate()!;
  function navigate(days: number) {
    setMeetings([]);
    setStart(first.plus({ days }).toISODate()!);
  }
  return (
    <>
      <Box component="header" sx={pageHeadingSx}>
        <Box>
          <Typography variant="h1">חדר ישיבות</Typography>
          <Typography variant="body1" sx={subtitleSx}>
            יומן ההזמנות · שעון ירושלים
          </Typography>
        </Box>
        <Button
          sx={buttonSx}
          variant="contained"
          disabled={!!lastAllowed && start > lastAllowed}
          startIcon={<Plus />}
          onClick={() =>
            setDialog({ date: start > now().toISODate()! ? start : now().toISODate()! })
          }
        >
          פגישה חדשה
        </Button>
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
          <Button sx={buttonSx} onClick={() => navigate(-14)}>
            הקודם
          </Button>
          <Button sx={buttonSx} variant="outlined" onClick={() => setStart(sunday().toISODate()!)}>
            היום
          </Button>
          <Button sx={buttonSx} onClick={() => navigate(14)}>
            הבא
          </Button>
        </Box>
        <Box component="bdi" sx={{ marginInlineStart: 'auto', alignSelf: 'center' }}>
          {shortDate(start)} – {shortDate(first.plus({ days: 13 }).toISODate()!)}
        </Box>
      </Box>
      <ErrorLine error={error} />
      {[0, 7].map((offset) => (
        <Box
          component="section"
          sx={{
            ...panelSx,
            mt: '14px',
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(5,minmax(0,1fr))' },
            p: 0,
            overflow: 'hidden',
          }}
          key={offset}
          aria-label={'שבוע ' + (offset ? 2 : 1)}
        >
          {Array.from({ length: 5 }, (_, i) => {
            const day = first.plus({ days: offset + i }).toISODate()!;
            const list = meetings.filter((m) => local(m.start).toISODate() === day);
            return (
              <Box
                sx={{
                  p: { xs: '8px 8px 36px', md: '16px 16px 42px' },
                  minHeight: { xs: 78, sm: 152 },
                  position: 'relative',
                  bgcolor: day === now().toISODate() ? 'action.hover' : undefined,
                  borderInlineEnd: { xs: 0, sm: '1px solid' },
                  borderBottom: { xs: '1px solid', sm: 0 },
                  borderColor: 'divider',
                  '&:last-child': { border: 0 },
                }}
                key={day}
              >
                <Typography variant="h3" sx={{ fontSize: '.98rem', mb: 1.5 }}>
                  {fullDate(day)}
                </Typography>
                {list.map((m) => (
                  <ButtonBase
                    sx={{
                      ...buttonSx,
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      borderRadius: '8px',
                      width: '100%',
                      textAlign: 'start',
                      justifyContent: 'stretch',
                      p: '9px',
                      mb: '6px',
                      display: 'grid',
                      gap: 0.5,
                      overflowWrap: 'anywhere',
                    }}
                    key={m.id}
                    onClick={() => setDialog({ meeting: m })}
                  >
                    <Box component="bdi" sx={{ fontSize: '.86rem' }}>
                      {clock(m.start)}–{clock(m.end)}
                    </Box>
                    <strong>{m.title}</strong>
                  </ButtonBase>
                ))}
                {!list.length && (
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    אין פגישות
                  </Box>
                )}
                {day >= now().toISODate()! && (!lastAllowed || day <= lastAllowed) && (
                  <ButtonBase
                    sx={{
                      position: 'absolute',
                      bottom: 8,
                      insetInlineStart: 12,
                      bgcolor: 'secondary.main',
                      color: 'primary.contrastText',
                      borderRadius: '8px',
                      p: 0.5,
                    }}
                    aria-label={'הוספת פגישה ' + shortDate(day)}
                    onClick={() => setDialog({ date: day })}
                  >
                    <Plus size={16} />
                  </ButtonBase>
                )}
              </Box>
            );
          })}
        </Box>
      ))}
      {dialog && (
        <MeetingDialog
          data={data}
          roomId={roomId}
          meeting={dialog.meeting}
          initialDate={dialog.date}
          close={() => setDialog(null)}
          saved={async (date) => {
            // Bring a newly booked date into view even if the form was opened
            // from a different fortnight.
            if (date && (date < start || date >= first.plus({ days: 14 }).toISODate()!)) {
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
