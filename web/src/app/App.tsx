import { Box, Button, Snackbar, Typography } from '@mui/material';
import { useState } from 'react';
import { endpoints } from '@app/endpoints';
import { entrySx, buttonSx } from '@app/layout';
import { Brand, ErrorLine, useAction } from '@app/components/Fields';
import { Account } from '@app/components/Account';
import { Login } from '@app/pages/Login';
import { Onboarding } from '@app/pages/Onboarding';
import { AppShell } from './AppShell';
import { NoticePanel } from './NoticePanel';
import { useHashRoute } from './useHashRoute';
import { useWorkspace } from './useWorkspace';

export function App() {
  const [panel, setPanel] = useState<'account' | 'notices' | null>(null);
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState('');
  const action = useAction();
  const { page, navigate } = useHashRoute();
  const { data, error, refresh, saved } = useWorkspace({
    onSaved: () => setMessage('השינויים נשמרו'),
    onUnauthorized: () => setPanel(null),
  });

  if (data === undefined)
    return (
      <Box component="main" sx={entrySx}>
        <Box component="section">
          <Brand />
          {error ? (
            <>
              <ErrorLine error={error} />
              <Button sx={buttonSx} onClick={refresh}>
                ניסיון חוזר
              </Button>
            </>
          ) : (
            <Typography variant="body1">טוען את סביבת העבודה…</Typography>
          )}
        </Box>
      </Box>
    );
  if (!data)
    return (
      <>
        <ErrorLine error={error} />
        <Login done={refresh} />
      </>
    );
  if (!data.me.site)
    return (
      <>
        <ErrorLine error={error} />
        <Onboarding me={data.me} done={refresh} />
      </>
    );
  const unread = data.notices.filter((n) => !n.seen).length;
  return (
    <>
      <AppShell
        data={data}
        page={page}
        unread={unread}
        error={error}
        saved={saved}
        onNotices={() => setPanel('notices')}
        onAccount={(anchor) => {
          setAccountAnchor(anchor);
          setPanel('account');
        }}
      />
      {panel === 'account' && (
        <Account
          me={data.me}
          anchor={accountAnchor}
          close={() => setPanel(null)}
          logout={async () => {
            await endpoints.auth.logout();
            setPanel(null);
            navigate('home');
            await refresh();
          }}
        />
      )}
      {panel === 'notices' && (
        <NoticePanel
          notices={data.notices}
          error={action.error}
          close={() => setPanel(null)}
          onMarkRead={() => {
            void action.run(async () => {
              await endpoints.workspace.markNoticesRead(data.notices[0].id);
              await refresh();
            });
          }}
        />
      )}
      <Snackbar
        open={!!message}
        autoHideDuration={2200}
        onClose={() => setMessage('')}
        message={message}
      />
    </>
  );
}
