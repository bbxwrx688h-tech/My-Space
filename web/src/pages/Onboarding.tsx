import { Box, Button, Radio, Typography } from '@mui/material';
import {
  stackSx,
  rowSx,
  entrySx,
  entryPanelSx,
  entryHeadingSx,
  fieldLabelSx,
  buttonSx,
} from '../layout';
import { useState } from 'react';
import { Person, Site } from '../../../shared/model';
import { api } from '../api';
import { Brand, ErrorLine, useAction } from '../components/Fields';
import { SiteSelect, StationFields, stationFrom } from '../components/StationFields';

export function Onboarding({ me, done }: { me: Person; done: () => Promise<void> }) {
  const [site, setSite] = useState<Site>('MID');
  const [owns, setOwns] = useState<boolean | null>(null);
  const action = useAction();
  return (
    <Box component="main" sx={entrySx}>
      <Box component="section" sx={entryPanelSx}>
        <Brand />
        <Typography variant="h1" sx={entryHeadingSx}>
          שלום, {me.name}
        </Typography>
        <Box
          component="form"
          sx={{ ...stackSx, mt: '20px' }}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void action.run(async () => {
              await api('onboarding', { site, station: owns ? stationFrom(data) : undefined });
              await done();
            });
          }}
        >
          <SiteSelect value={site} onChange={(s) => setSite(s as Site)} />
          <Box
            component="fieldset"
            sx={{
              ...rowSx,
              flexWrap: 'wrap',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '10px',
              p: 1.5,
              m: 0,
            }}
          >
            <Typography variant="inherit" component="legend" sx={fieldLabelSx}>
              האם יש לך עמדת עבודה קבועה?
            </Typography>
            <Box component="label" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <Radio
                size="small"
                sx={{ p: '3px', color: 'text.secondary' }}
                name="owns"
                checked={owns === true}
                onChange={() => setOwns(true)}
              />{' '}
              יש לי עמדה
            </Box>
            <Box component="label" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <Radio
                size="small"
                sx={{ p: '3px', color: 'text.secondary' }}
                name="owns"
                checked={owns === false}
                onChange={() => setOwns(false)}
              />{' '}
              אני מחפש/ת עמדה
            </Box>
          </Box>
          {owns && <StationFields key={site} site={site} />}
          <ErrorLine error={action.error} />
          <Button
            sx={buttonSx}
            variant="contained"
            type="submit"
            disabled={owns === null || action.busy}
          >
            המשך לסביבת העבודה
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
