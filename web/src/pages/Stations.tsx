import { Box, Button, Typography } from '@mui/material';
import {
  stackSx,
  rowSx,
  panelSx,
  filterBarSx,
  pageHeadingSx,
  subtitleSx,
  buttonSx,
} from '../layout';
import { useState } from 'react';
import { Monitor, Plus } from 'lucide-react';
import { Workspace } from '../../../shared/model';
import { DateField, ErrorLine } from '../components/Fields';
import { SiteSelect } from '../components/StationFields';
import { DaysDialog, offerRange, PublishDialog } from '../components/StationDialogs';
import { now } from '../dates';

export function Stations({ data, saved }: { data: Workspace; saved: () => Promise<void> }) {
  const [site, setSite] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dialog, setDialog] = useState<'add' | 'publish' | number | null>(null);
  const close = () => setDialog(null);
  const offer = data.offers.find((o) => o.id === dialog);
  const badRange = !!from && !!to && from > to;
  // Filter the latest workspace snapshot locally. Owners can still manage an
  // offer when all of its matching days have been booked.
  const offers = data.offers.filter(
    (o) =>
      (!site || o.station.site === site) &&
      o.days.some(
        (d) =>
          (!from || d.date >= from) &&
          (!to || d.date <= to) &&
          (o.station.ownerId === data.me.id || d.status === 'available'),
      ),
  );
  return (
    <>
      <Box component="header" sx={pageHeadingSx}>
        <Box>
          <Typography variant="h1">עמדות עבודה</Typography>
          <Typography variant="body1" sx={subtitleSx}>
            בחירת עמדה פנויה לפי אתר וימים.
          </Typography>
        </Box>
        <Box sx={rowSx}>
          <Button
            sx={buttonSx}
            variant="outlined"
            startIcon={<Plus size={17} />}
            onClick={() => setDialog('add')}
          >
            הוספת עמדה
          </Button>
          <Button
            sx={buttonSx}
            variant="contained"
            disabled={!data.stations.length}
            onClick={() => setDialog('publish')}
          >
            פרסום הצעה
          </Button>
        </Box>
      </Box>
      <Box sx={filterBarSx}>
        <SiteSelect value={site} onChange={setSite} all />
        <DateField
          label="מתאריך"
          value={from}
          min={now().toISODate()!}
          onChange={setFrom}
          clearable
        />
        <DateField
          label="עד תאריך"
          value={to}
          min={from || now().toISODate()!}
          onChange={setTo}
          clearable
        />
        {(site || from || to) && (
          <Button
            sx={buttonSx}
            onClick={() => {
              setSite('');
              setFrom('');
              setTo('');
            }}
          >
            ניקוי סינון
          </Button>
        )}
      </Box>
      <ErrorLine error={badRange ? 'תאריך הסיום קודם לתאריך ההתחלה' : ''} />
      <Box sx={stackSx}>
        {!badRange &&
          offers.map((o) => (
            <Box
              component="article"
              sx={{
                ...panelSx,
                ...rowSx,
                flexWrap: 'wrap',
                gap: { xs: '10px', sm: 3 },
                overflowWrap: 'anywhere',
              }}
              key={o.id}
            >
              <Box
                component="span"
                sx={{
                  width: 46,
                  height: 46,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: '12px',
                  bgcolor: 'action.selected',
                  color: 'primary.dark',
                }}
              >
                <Monitor />
              </Box>
              <Box>
                <strong>
                  {o.station.site} · חדר {o.station.room}
                </strong>
                <Typography
                  variant="body1"
                  component="p"
                  sx={{ fontSize: '.94rem', color: 'text.secondary', mt: '5px' }}
                >
                  {o.station.owner} · <bdi>{o.station.os}</bdi>
                </Typography>
              </Box>
              <Box sx={{ flex: 1, minWidth: 160 }}>
                <strong>{o.station.description}</strong>
                {o.note && (
                  <Typography
                    variant="body1"
                    component="p"
                    sx={{ fontSize: '.94rem', color: 'text.secondary', mt: '5px' }}
                  >
                    {o.note}
                  </Typography>
                )}
              </Box>
              <bdi>{offerRange(o)}</bdi>
              <Button sx={buttonSx} variant="outlined" onClick={() => setDialog(o.id)}>
                {o.station.ownerId === data.me.id ? 'ניהול ההצעה' : 'בחירת ימים'}
              </Button>
            </Box>
          ))}
        {!badRange && !offers.length && (
          <Typography variant="body1" sx={{ ...panelSx, color: 'text.secondary' }}>
            אין עמדות פנויות בבחירה הנוכחית.
          </Typography>
        )}
      </Box>
      {(dialog === 'add' || dialog === 'publish') && (
        <PublishDialog data={data} close={close} saved={saved} add={dialog === 'add'} />
      )}
      {offer && (
        <DaysDialog
          data={data}
          close={close}
          saved={saved}
          offer={offer}
          from={offer.station.ownerId === data.me.id ? undefined : from}
          to={offer.station.ownerId === data.me.id ? undefined : to}
          mode={offer.station.ownerId === data.me.id ? 'withdraw' : 'book'}
        />
      )}
    </>
  );
}
