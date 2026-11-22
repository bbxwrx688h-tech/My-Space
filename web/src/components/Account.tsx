import { Box, Button, NativeSelect, Typography } from '@mui/material';
import { stackSx, rowSx, buttonSx, selectSx } from '../layout';
import { useEffect, useState } from 'react';
import { Person } from '../../../shared/model';
import { api } from '../api';
import { ErrorLine, Modal, useAction } from './Fields';

export function Account({
  me,
  close,
  logout,
}: {
  me: Person;
  close: () => void;
  logout: () => Promise<void>;
}) {
  const [users, setUsers] = useState<Person[]>([]);
  const [error, setError] = useState('');
  const action = useAction();
  useEffect(() => {
    if (me.role === 'admin')
      api<Person[]>('admin/users')
        .then(setUsers)
        .catch((e) => setError(e.message));
  }, [me.role]);
  return (
    <Modal title="החשבון שלי" close={close}>
      <Box sx={stackSx}>
        <strong>
          {me.name} {me.surname}
        </strong>
        <Typography variant="body1">
          <bdi>{me.upn}</bdi> · {me.site} ·{' '}
          {{ user: 'עובד/ת', boss: 'מנהל/ת', admin: 'מנהל מערכת' }[me.role]}
        </Typography>
        {me.role === 'admin' && (
          <>
            <Typography variant="h3">ניהול תפקידים</Typography>
            {users.length === 0 && (
              <Typography variant="body1">עדיין אין עובדים רשומים.</Typography>
            )}
            {users.map((p) => (
              <Box component="label" sx={{ ...rowSx, justifyContent: 'space-between' }} key={p.id}>
                <Box component="span">
                  {p.name} {p.surname}{' '}
                  <Typography
                    variant="inherit"
                    component="small"
                    sx={{ color: 'text.secondary', fontSize: '.83em' }}
                  >
                    <bdi>{p.upn}</bdi>
                  </Typography>
                </Box>
                <NativeSelect
                  disableUnderline
                  sx={{ ...selectSx, width: 'auto' }}
                  value={p.role}
                  disabled={action.busy}
                  onChange={(e) => {
                    const role = e.target.value as 'boss' | 'user';
                    void action.run(async () => {
                      await api('admin/role', { personId: p.id, role });
                      setUsers((prev) => prev.map((u) => (u.id === p.id ? { ...u, role } : u)));
                    });
                  }}
                >
                  <option value="user">עובד/ת</option>
                  <option value="boss">מנהל/ת</option>
                </NativeSelect>
              </Box>
            ))}
          </>
        )}
        <ErrorLine error={action.error || error} />
        <Button sx={buttonSx} variant="outlined" onClick={() => action.run(logout)}>
          יציאה מהמערכת
        </Button>
      </Box>
    </Modal>
  );
}
