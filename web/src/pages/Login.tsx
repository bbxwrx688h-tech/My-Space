import { Box, Button, InputBase, NativeSelect, Typography } from '@mui/material';
import {
  stackSx,
  entrySx,
  entryPanelSx,
  entryHeadingSx,
  buttonSx,
  textInputSx,
  selectSx,
} from '../layout';
import { useEffect, useState } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import { endpoints } from '../endpoints';
import { Brand, ErrorLine, Field, useAction } from '../components/Fields';

export function Login({ done }: { done: () => Promise<void> }) {
  const [employees, setEmployees] = useState<{ upn: string; label: string }[]>([]);
  const [mode, setMode] = useState<'main' | 'dev' | 'admin'>('main');
  const [loadError, setLoadError] = useState('');
  const action = useAction();
  useEffect(() => {
    endpoints.auth
      .options()
      .then((v) => setEmployees(v.employees))
      .catch((e) => setLoadError(e.message));
  }, []);
  return (
    <Box component="main" sx={entrySx}>
      <Box component="section" sx={entryPanelSx}>
        <Brand />
        <Typography variant="h1" sx={entryHeadingSx}>
          כניסה לסביבת העבודה
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mb: '25px' }}>
          הזמנת עמדות עבודה וחדרי ישיבות לעובדי הארגון.
        </Typography>
        <ErrorLine error={action.error || loadError} />
        {mode === 'main' ? (
          <Box sx={{ ...stackSx, mt: '20px' }}>
            <Button
              sx={buttonSx}
              variant="contained"
              startIcon={<LogIn />}
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  await endpoints.auth.adfs();
                  await done();
                })
              }
            >
              כניסה באמצעות AD FS
            </Button>
            <Button
              sx={buttonSx}
              variant="outlined"
              startIcon={<KeyRound />}
              onClick={() => setMode('admin')}
            >
              כניסת מנהל מערכת
            </Button>
            {employees.length > 0 && (
              <Button sx={buttonSx} onClick={() => setMode('dev')}>
                כניסת פיתוח
              </Button>
            )}
          </Box>
        ) : (
          <Box
            component="form"
            sx={{ ...stackSx, mt: '20px' }}
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const value = (name: string) => String(data.get(name) ?? '');
              void action.run(async () => {
                if (mode === 'admin')
                  await endpoints.auth.admin({
                    username: value('username'),
                    password: value('password'),
                  });
                else await endpoints.auth.dev({ upn: value('upn') });
                await done();
              });
            }}
          >
            {mode === 'admin' ? (
              <>
                <Field label="שם משתמש">
                  <InputBase sx={textInputSx} required name="username" autoComplete="username" />
                </Field>
                <Field label="סיסמה">
                  <InputBase
                    sx={textInputSx}
                    required
                    type="password"
                    name="password"
                    autoComplete="current-password"
                  />
                </Field>
              </>
            ) : (
              <Field label="חשבון פיתוח">
                <NativeSelect disableUnderline inputProps={{ name: 'upn' }} sx={selectSx}>
                  {employees.map((p) => (
                    <option key={p.upn} value={p.upn}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Button sx={buttonSx} variant="contained" type="submit" disabled={action.busy}>
              כניסה
            </Button>
            <Button sx={buttonSx} onClick={() => setMode('main')}>
              חזרה
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
