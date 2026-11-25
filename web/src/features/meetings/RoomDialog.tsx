import { Box, Button, InputBase } from '@mui/material';
import { useState } from 'react';
import type { Site } from '@shared/model';
import { ErrorLine, Field, Modal, useAction } from '@app/components/Fields';
import { SiteSelect } from '@app/components/StationFields';
import { endpoints } from '@app/endpoints';
import { buttonSx, stackSx, textInputSx } from '@app/layout';
import { defaultSite } from '@app/options';

/** Creates a room from the calendar; the server also enforces admin access. */
export function RoomDialog({
  site,
  close,
  saved,
}: {
  site: Site | null;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [roomSite, setRoomSite] = useState<Site>(site ?? defaultSite);
  const action = useAction();

  return (
    <Modal title="הוספת חדר ישיבות" close={close}>
      <Box
        component="form"
        sx={stackSx}
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            await endpoints.users.createRoom({ name, site: roomSite });
            await saved();
            close();
          });
        }}
      >
        <Field label="שם חדר הישיבות">
          <InputBase
            sx={textInputSx}
            required
            inputProps={{ maxLength: 150 }}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <SiteSelect value={roomSite} onChange={(value) => setRoomSite(value as Site)} />
        <ErrorLine error={action.error} />
        <Button sx={buttonSx} variant="contained" type="submit" disabled={action.busy}>
          הוספת חדר ישיבות
        </Button>
      </Box>
    </Modal>
  );
}
