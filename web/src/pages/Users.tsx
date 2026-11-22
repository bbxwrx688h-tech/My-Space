import {
  Box,
  Button,
  InputBase,
  NativeSelect,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Person } from '../../../shared/model';
import { api } from '../api';
import { buttonSx, panelSx, selectSx, textInputSx } from '../layout';
import { ErrorLine, Field, useAction } from '../components/Fields';

export function Users() {
  const [users, setUsers] = useState<Person[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const action = useAction();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<Person[]>('admin/users')
      .then((result) => {
        if (active) setUsers(result);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);

  // The directory contains all registered employees. Search the loaded snapshot
  // locally so typing does not create a request for every character.
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = users.filter((person) => {
    const text = `${person.name} ${person.surname} ${person.upn}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
  const pageSize = 20;
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          mb: 3,
        }}
      >
        <Typography variant="h1">ניהול משתמשים</Typography>
        <Button
          sx={buttonSx}
          variant="outlined"
          disabled={loading || action.busy}
          onClick={() => {
            setPage(0);
            setRevision((previous) => previous + 1);
          }}
        >
          רענון רשימה
        </Button>
      </Box>
      <Box sx={{ ...panelSx, mb: 2, maxWidth: 480 }}>
        <Field label="חיפוש לפי שם או כתובת דוא״ל">
          <InputBase
            sx={textInputSx}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="שם פרטי, שם משפחה או דוא״ל"
          />
        </Field>
      </Box>
      <ErrorLine error={error || action.error} />
      <Box sx={{ ...panelSx, p: 0, overflow: 'hidden' }}>
        {loading ? (
          <Typography sx={{ p: 3 }}>טוען משתמשים…</Typography>
        ) : error ? (
          <Typography sx={{ p: 3 }}>
            לא ניתן לטעון את רשימת המשתמשים. יש לרענן את הרשימה.
          </Typography>
        ) : filtered.length === 0 ? (
          <Typography sx={{ p: 3 }}>
            {query.trim() ? 'לא נמצאו משתמשים התואמים לחיפוש.' : 'עדיין אין עובדים רשומים.'}
          </Typography>
        ) : (
          <>
            <TableContainer>
              <Table aria-label="משתמשים">
                <TableHead>
                  <TableRow>
                    <TableCell>שם</TableCell>
                    <TableCell>דוא״ל</TableCell>
                    <TableCell>אתר</TableCell>
                    <TableCell>תפקיד</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.slice(page * pageSize, (page + 1) * pageSize).map((person) => (
                    <TableRow key={person.id}>
                      <TableCell>
                        {person.name} {person.surname}
                      </TableCell>
                      <TableCell>
                        <bdi>{person.upn}</bdi>
                      </TableCell>
                      <TableCell>{person.site || '—'}</TableCell>
                      <TableCell>
                        <NativeSelect
                          disableUnderline
                          sx={{ ...selectSx, width: 'auto', minWidth: 130, ...buttonSx }}
                          inputProps={{
                            'aria-label': `תפקיד ${person.name} ${person.surname} ${person.upn}`,
                          }}
                          value={person.role}
                          disabled={action.busy}
                          onChange={(event) => {
                            const role = event.target.value as 'user' | 'boss';
                            void action.run(async () => {
                              await api('admin/role', { personId: person.id, role });
                              setUsers((previous) =>
                                previous.map((user) =>
                                  user.id === person.id ? { ...user, role } : user,
                                ),
                              );
                            });
                          }}
                        >
                          <option value="user">עובד/ת</option>
                          <option value="boss">מנהל/ת</option>
                        </NativeSelect>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={filtered.length}
              page={page}
              rowsPerPage={pageSize}
              rowsPerPageOptions={[]}
              onPageChange={(_, next) => setPage(next)}
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} מתוך ${count}`}
            />
          </>
        )}
      </Box>
    </Box>
  );
}
