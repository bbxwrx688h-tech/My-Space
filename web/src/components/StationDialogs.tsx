import { Box, Button, Checkbox, InputBase, NativeSelect, Typography } from '@mui/material';
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
import { useState } from 'react';
import { Offer, Workspace } from '../../../shared/model';
import { endpoints } from '../endpoints';
import { fullDate, now, shortDate } from '../dates';
import { DateField, ErrorLine, Field, Modal, useAction } from './Fields';
import { StationFields, stationFrom } from './StationFields';

type Props = { data: Workspace; close: () => void; saved: () => Promise<void> };
export function PublishDialog({
  data,
  close,
  saved,
  add,
  onAdded,
}: Props & { add: boolean; onAdded?: () => void }) {
  const [start, setStart] = useState(now().toISODate()!);
  const [end, setEnd] = useState(start);
  const [stationId, setStationId] = useState(data.stations[0]?.id || 0);
  const station = data.stations.find((s) => s.id === stationId);
  const action = useAction();
  const title = add ? 'הוספת עמדה' : 'פרסום הצעה';
  return (
    <Modal title={title} close={close}>
      <Box
        component="form"
        sx={stackSx}
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void action.run(async () => {
            if (add) await endpoints.stations.create(stationFrom(form));
            else
              await endpoints.stations.publish({
                stationId,
                start,
                end,
                note: String(form.get('note') ?? ''),
              });
            await saved();
            if (add && onAdded) onAdded();
            else close();
          });
        }}
      >
        {add ? (
          <StationFields site={data.me.site!} />
        ) : (
          <>
            <Field label="העמדה שלי">
              <NativeSelect
                disableUnderline
                sx={selectSx}
                value={stationId}
                onChange={(e) => setStationId(Number(e.target.value))}
              >
                {data.stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.site} · חדר {s.room} · {s.description}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {station && (
              <Typography variant="body1" sx={insetSx}>
                {station.owner} · {station.os} · {station.description}
              </Typography>
            )}
            <Box sx={pairSx}>
              <DateField
                label="מתאריך"
                value={start}
                min={now().toISODate()!}
                onChange={(d) => {
                  setStart(d);
                  if (end < d) setEnd(d);
                }}
              />
              <DateField label="עד תאריך" value={end} min={start} onChange={setEnd} />
            </Box>
            <Field label="הערה להצעה (רשות)">
              <InputBase
                multiline
                minRows={3}
                inputProps={{ maxLength: 2000 }}
                sx={textInputSx}
                name="note"
              />
            </Field>
          </>
        )}
        <ErrorLine error={action.error} />
        <Button sx={buttonSx} type="submit" variant="contained" disabled={action.busy}>
          {title}
        </Button>
      </Box>
    </Modal>
  );
}

export type DayAction = 'book' | 'release' | 'withdraw';
export function DaysDialog({
  data,
  offer,
  mode,
  from,
  to,
  close,
  saved,
}: Props & {
  offer: Offer;
  mode: DayAction;
  from?: string;
  to?: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const action = useAction();
  const myDates = new Set(
    data.offers.flatMap((o) => o.days.filter((d) => d.status === 'mine').map((d) => d.date)),
  );
  // Booking is per day. A borrower cannot select a second station for a day
  // already booked elsewhere, while an owner may withdraw booked days.
  const days = offer.days.filter(
    (d) =>
      d.date >= now().toISODate()! &&
      (!from || d.date >= from) &&
      (!to || d.date <= to) &&
      (mode !== 'release' || d.status === 'mine'),
  );
  const available = days
    .filter((d) => mode !== 'book' || (d.status === 'available' && !myDates.has(d.date)))
    .map((d) => d.date);
  // Reconcile selection if a background refresh reports another employee's booking.
  const chosen = selected.filter((d) => available.includes(d));
  const titles = {
    book: 'בחירת ימים לעמדה',
    release: 'שחרור ימי הזמנה',
    withdraw: 'הסרת ימים מההצעה',
  };
  return (
    <Modal title={titles[mode]} close={close}>
      <Box sx={stackSx}>
        <Typography variant="body1">
          {offer.station.owner} · {offer.station.site} · חדר {offer.station.room} ·{' '}
          {offer.station.description}
        </Typography>
        {mode === 'withdraw' && (
          <Typography variant="body1" sx={warningSx}>
            הסרת יום מוזמן תבטל את ההזמנה ותשלח הודעה לעובד/ת.
          </Typography>
        )}
        <Button
          sx={buttonSx}
          disabled={!available.length}
          onClick={() => setSelected(chosen.length === available.length ? [] : available)}
        >
          {chosen.length === available.length ? 'ניקוי הבחירה' : 'בחירת כל הימים הזמינים'}
        </Button>
        <Box sx={{ display: 'grid', gap: 0.5, maxHeight: '42vh', overflow: 'auto' }}>
          {days.map((d) => {
            const blocked = !available.includes(d.date);
            const note =
              myDates.has(d.date) && mode === 'book'
                ? 'כבר יש לך הזמנה ביום זה'
                : d.status === 'occupied'
                  ? 'העמדה מוזמנת'
                  : '';
            return (
              <Box
                component="label"
                sx={{
                  ...rowSx,
                  gap: 1,
                  p: '9px',
                  bgcolor: 'action.hover',
                  borderRadius: '6px',
                  color: blocked ? 'text.secondary' : 'inherit',
                }}
                key={d.date}
              >
                <Checkbox
                  size="small"
                  sx={{ p: '3px', color: 'text.secondary' }}
                  disabled={blocked}
                  checked={chosen.includes(d.date)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? [...chosen, d.date] : chosen.filter((x) => x !== d.date),
                    )
                  }
                />
                {fullDate(d.date)}{' '}
                <Typography
                  variant="inherit"
                  component="small"
                  sx={{ color: 'text.secondary', fontSize: '.83em', marginInlineStart: 'auto' }}
                >
                  {note}
                </Typography>
              </Box>
            );
          })}
        </Box>
        <ErrorLine error={action.error} />
        <Button
          sx={buttonSx}
          variant="contained"
          disabled={!chosen.length || action.busy}
          onClick={() =>
            action.run(async () => {
              await endpoints.stations.days({ action: mode, offerId: offer.id, days: chosen });
              await saved();
              close();
            })
          }
        >
          {mode === 'book' ? 'אישור הזמנה' : mode === 'release' ? 'אישור שחרור' : 'אישור הסרה'} (
          {chosen.length})
        </Button>
      </Box>
    </Modal>
  );
}
export function offerRange(offer: Offer) {
  const first = shortDate(offer.days[0].date),
    last = shortDate(offer.days[offer.days.length - 1].date);
  return first === last ? first : first + ' – ' + last;
}
