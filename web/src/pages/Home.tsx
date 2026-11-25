import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Tabs,
  Tab,
} from '@mui/material';
import { rowSx, pairSx, panelSx, subtitleSx, buttonSx } from '../layout';
import { ReactNode, useState } from 'react';
import { CalendarDays, ChevronLeft, FileText, Monitor } from 'lucide-react';
import { Meeting, Workspace } from '../../../shared/model';
import { clock, endClock, fullDate, now } from '../dates';
import { DaysDialog, offerRange, PublishDialog } from '../components/StationDialogs';
import { MeetingDialog } from '@app/features/meetings/MeetingDialog';

const featureSx = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '17px 23px',
  alignItems: 'start',
  borderRadius: '16px',
  p: '16px 20px',
  minHeight: 0,
  '& > svg': { width: 58, height: 58, color: 'inherit', strokeWidth: 1.65 },
  '@media (max-width:800px)': { p: '18px', gap: 1.5, '& > svg': { width: 32, height: 32 } },
} as const;
const cellSx = {
  textAlign: 'start',
  color: 'inherit',
  fontSize: { xs: '.86rem', sm: '1rem' },
  p: { xs: '6px', sm: '8px 12px' },
  borderColor: 'divider',
  overflowWrap: { xs: 'normal', sm: 'anywhere' },
  '&.MuiTableCell-head': { fontSize: '.89rem', color: 'text.secondary', fontWeight: 700 },
  'tr:last-child > &.MuiTableCell-body': { border: 0 },
} as const;

function Activity({
  title,
  icon,
  headers,
  rows,
  empty,
}: {
  title: string;
  icon: ReactNode;
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  return (
    <Box component="section" sx={{ ...panelSx, mt: '14px' }}>
      <Typography
        variant="h2"
        sx={{
          ...rowSx,
          gap: '15px',
          mb: '13px',
          '& svg': { width: 30, height: 30, color: 'primary.main', strokeWidth: 1.7 },
        }}
      >
        {icon}
        {title}
      </Typography>
      {rows.length ? (
        <TableContainer sx={{ overflow: 'auto', maxHeight: '35vh' }}>
          <Table>
            <TableHead>
              <TableRow>
                {headers.map((h) => (
                  <TableCell sx={cellSx} key={h}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((cells, i) => (
                <TableRow key={i}>
                  {cells.map((cell, j) => (
                    <TableCell sx={cellSx} key={j}>
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography variant="body1" sx={{ color: 'text.secondary', py: '14px' }}>
          {empty}
        </Typography>
      )}
    </Box>
  );
}
export function Home({ data, saved }: { data: Workspace; saved: () => Promise<void> }) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [activity, setActivity] = useState(0);
  const [stationDialog, setStationDialog] = useState(false);
  const [days, setDays] = useState<{ id: number; mode: 'release' | 'withdraw' } | null>(null);
  const offer = data.offers.find((o) => o.id === days?.id);
  return (
    <>
      <Box component="header" sx={{ mb: '22px' }}>
        <Typography variant="h1">שלום, {data.me.name}</Typography>
        <Typography variant="body1" sx={subtitleSx}>
          {now().toFormat('cccc, d בLLLL yyyy')}
        </Typography>
      </Box>
      <Box
        sx={{
          ...pairSx,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))' },
          mb: '22px',
        }}
      >
        <Box
          component="section"
          sx={{ ...featureSx, bgcolor: 'primary.main', color: 'primary.contrastText' }}
        >
          <Monitor />
          <Box>
            <Typography variant="h2" sx={{ fontSize: 'clamp(1.6rem,2.45vw,2.3rem)' }}>
              עמדות עבודה
            </Typography>
            <Typography variant="body1" sx={{ mt: '6px', fontSize: '1.1rem' }}>
              חיפוש והזמנה של עמדת עבודה לפי אתר ותאריך.
            </Typography>
          </Box>
          <Box
            sx={{
              gridColumn: '1/-1',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              alignItems: 'center',
            }}
          >
            <Button
              sx={{ ...buttonSx, minHeight: 47, fontSize: '1.14rem' }}
              variant="contained"
              color="secondary"
              href="#stations"
              endIcon={<ChevronLeft />}
            >
              לבחירת עמדה
            </Button>
            <Button
              sx={{ ...buttonSx, minHeight: 47, color: 'inherit', borderColor: 'currentColor' }}
              variant="outlined"
              disabled={data.stations.length === 0}
              onClick={() => setStationDialog(true)}
            >
              פרסום הצעה לעמדה שלי
            </Button>
            {data.stations.length === 0 && (
              <Typography variant="body2" sx={{ width: '100%', color: 'inherit' }}>
                כדי לפרסם הצעה יש להוסיף עמדה בעמוד עמדות העבודה.
              </Typography>
            )}
          </Box>
        </Box>
        <Box
          component="section"
          sx={{ ...featureSx, bgcolor: 'primary.light', color: 'text.primary' }}
        >
          <CalendarDays />
          <Box>
            <Typography variant="h2" sx={{ fontSize: 'clamp(1.6rem,2.45vw,2.3rem)' }}>
              חדר הישיבות
            </Typography>
            <Typography variant="body1" sx={{ mt: '6px', fontSize: '1.1rem' }}>
              צפייה ביומן והזמנת חדר ישיבות לפגישה.
            </Typography>
          </Box>
          <Button
            sx={{
              ...buttonSx,
              gridColumn: '1/-1',
              justifySelf: 'start',
              alignSelf: 'end',
              minWidth: 'min(235px,100%)',
              minHeight: 47,
              fontSize: '1.14rem',
            }}
            variant="contained"
            color="secondary"
            href="#calendar"
            endIcon={<ChevronLeft />}
          >
            לפתיחת היומן
          </Button>
        </Box>
      </Box>
      <Tabs
        value={activity}
        onChange={(_, value: number) => setActivity(value)}
        aria-label="הפעילות שלי"
      >
        <Tab label="הפגישות שלי" />
        <Tab label="ההזמנות שלי" />
        <Tab label="ההצעות שלי" />
      </Tabs>
      {activity === 0 && (
        <Activity
          title="הפגישות שלי"
          icon={<CalendarDays />}
          headers={['תאריך', 'שעה', 'פגישה', 'חדר', 'פעולה']}
          empty="אין לך פגישות קרובות."
          rows={data.meetings.map((m) => [
            fullDate(m.start),
            <bdi>
              {clock(m.start)}–{endClock(m.start, m.end)}
            </bdi>,
            m.title,
            data.rooms.find((r) => r.id === m.roomId)?.site,
            <Button sx={{ ...buttonSx, p: '2px 8px' }} onClick={() => setMeeting(m)}>
              פרטים
            </Button>,
          ])}
        />
      )}
      {activity === 1 && (
        <Activity
          title="ההזמנות שלי"
          icon={<Monitor />}
          headers={['תאריך', 'אתר וחדר', 'בעל/ת העמדה', 'פעולה']}
          empty="אין לך הזמנות לעמדת עבודה."
          rows={data.offers
            .flatMap((o) =>
              o.days.filter((d) => d.status === 'mine').map((d) => ({ date: d.date, o })),
            )
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(({ date, o }) => [
              fullDate(date),
              o.station.site + ' · ' + o.station.room,
              o.station.owner,
              <Button
                sx={{ ...buttonSx, p: '2px 8px' }}
                onClick={() => setDays({ id: o.id, mode: 'release' })}
              >
                ניהול הזמנה
              </Button>,
            ])}
        />
      )}
      {activity === 2 && (
        <Activity
          title="ההצעות שלי"
          icon={<FileText />}
          headers={['תאריכים', 'אתר וחדר', 'תיאור', 'פעולה']}
          empty="עדיין לא פרסמת הצעות לעמדה."
          rows={data.offers
            .filter((o) => o.station.ownerId === data.me.id)
            .map((o) => [
              <bdi>{offerRange(o)}</bdi>,
              o.station.site + ' · ' + o.station.room,
              o.station.description,
              <Button
                sx={{ ...buttonSx, p: '2px 8px' }}
                onClick={() => setDays({ id: o.id, mode: 'withdraw' })}
              >
                ניהול ההצעה
              </Button>,
            ])}
        />
      )}
      {meeting && (
        <MeetingDialog
          data={data}
          roomId={meeting.roomId}
          meeting={meeting}
          close={() => setMeeting(null)}
          saved={saved}
        />
      )}
      {stationDialog && (
        <PublishDialog
          data={data}
          close={() => setStationDialog(false)}
          saved={saved}
          add={false}
        />
      )}
      {offer && days && (
        <DaysDialog
          data={data}
          offer={offer}
          mode={days.mode}
          close={() => setDays(null)}
          saved={saved}
        />
      )}
    </>
  );
}
