import { Box, Button, Popover, Typography } from '@mui/material';
import { stackSx, buttonSx } from '../layout';
import { Person } from '../../../shared/model';
import { ErrorLine, useAction } from './Fields';

export function Account({
  me,
  anchor,
  close,
  logout,
}: {
  me: Person;
  anchor: HTMLElement | null;
  close: () => void;
  logout: () => Promise<void>;
}) {
  const action = useAction();
  return (
    <Popover
      open
      anchorEl={anchor}
      onClose={close}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
    >
      <Box sx={{ ...stackSx, p: 2, width: 340, maxWidth: '90vw' }}>
        <strong>
          {me.name} {me.surname}
        </strong>
        <Typography>
          <bdi>{me.upn}</bdi> · {me.site} ·{' '}
          {{ user: 'עובד/ת', boss: 'מנהל/ת', admin: 'מנהל מערכת' }[me.role]}
        </Typography>
        {me.role === 'admin' && (
          <Button sx={buttonSx} href="#users" onClick={close}>
            ניהול משתמשים
          </Button>
        )}
        <ErrorLine error={action.error} />
        <Button sx={buttonSx} variant="outlined" onClick={() => action.run(logout)}>
          יציאה מהמערכת
        </Button>
      </Box>
    </Popover>
  );
}
