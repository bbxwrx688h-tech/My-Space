import {
  Badge,
  Box,
  Button,
  ButtonBase,
  IconButton,
  Link,
  Snackbar,
  Typography,
} from '@mui/material';
import { stackSx, rowSx, entrySx, insetSx, buttonSx } from './layout';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Workspace } from '../../shared/model';
import { api, ApiError } from './api';
import { Account } from './components/Account';
import { Brand, ErrorLine, Modal, useAction } from './components/Fields';
import { Calendar } from './pages/Calendar';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { Stations } from './pages/Stations';
import { Users } from './pages/Users';
import { clock, shortDate } from './dates';

const shellWidth = { width: { xs: '94%', sm: 'min(92%,1440px)' }, mx: 'auto' } as const;

const pages = {
  home: 'בית',
  stations: 'עמדות עבודה',
  calendar: 'חדר ישיבות',
  users: 'ניהול משתמשים',
};
function currentPage() {
  const hash = location.hash.slice(1);
  return Object.hasOwn(pages, hash) ? (hash as keyof typeof pages) : 'home';
}
export function App() {
  const [data, setData] = useState<Workspace | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [page, setPage] = useState(currentPage);
  const [panel, setPanel] = useState<'account' | 'notices' | null>(null);
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState('');
  const action = useAction(),
    sequence = useRef(0);
  const refresh = useCallback(async () => {
    // A slow poll must never overwrite a newer mutation refresh or sign-out.
    const version = ++sequence.current;
    try {
      const value = await api<Workspace>('workspace');
      if (version === sequence.current) {
        setData(value);
        setError('');
      }
    } catch (e) {
      if (version !== sequence.current) return;
      if (e instanceof ApiError && e.status === 401) {
        setData(null);
        setPanel(null);
        setError('');
      } else setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const change = () => setPage(currentPage());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, [refresh]);
  const authenticated = !!data;
  useEffect(() => {
    if (!authenticated) return;
    // Refresh availability and notices periodically and when returning to the tab.
    const poll = () => {
      if (!document.hidden) void refresh();
    };
    const timer = setInterval(poll, 15000);
    window.addEventListener('focus', poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', poll);
    };
  }, [authenticated, refresh]);
  const saved = async () => {
    await refresh();
    setMessage('השינויים נשמרו');
  };
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
      <Box
        component="header"
        sx={{
          bgcolor: 'secondary.dark',
          color: 'secondary.contrastText',
          position: 'sticky',
          top: 0,
          zIndex: 3,
        }}
      >
        <Box
          sx={{
            ...shellWidth,
            ...rowSx,
            gap: 'clamp(1rem,10.5vw,10rem)',
            minHeight: 68,
            '@media (max-width:800px)': { gap: 1.5, flexWrap: 'wrap', py: '10px' },
          }}
        >
          <Link
            sx={{ color: 'inherit', textDecoration: 'none' }}
            href="#home"
            aria-label="My-Space בית"
          >
            <Brand />
          </Link>
          <Box
            component="nav"
            sx={{
              ...rowSx,
              gap: '10px',
              order: { xs: 3, sm: 0 },
              width: { xs: '100%', sm: 'auto' },
              justifyContent: { xs: 'space-around', sm: 'start' },
            }}
            aria-label="ניווט ראשי"
          >
            {Object.entries(pages)
              .filter(([key]) => key !== 'users' || data.me.role === 'admin')
              .map(([key, label]) => (
                <Link
                  sx={{
                    color: 'inherit',
                    bgcolor: page === key ? 'primary.main' : 'transparent',
                    textDecoration: 'none',
                    p: '10px 23px',
                    borderRadius: '8px',
                    fontSize: '1.14rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    '&:hover': { bgcolor: 'primary.main', color: 'primary.contrastText' },
                    '@media (max-width:800px)': { p: 1, fontSize: '1rem' },
                  }}
                  key={key}
                  href={'#' + key}
                  aria-current={page === key ? 'page' : undefined}
                >
                  {label}
                </Link>
              ))}
          </Box>
          <Box sx={{ ...rowSx, marginInlineStart: 'auto' }}>
            <IconButton
              sx={{ color: 'inherit' }}
              aria-label="התראות"
              onClick={() => setPanel('notices')}
            >
              <Badge color="primary" badgeContent={unread}>
                <Bell size={23} />
              </Badge>
            </IconButton>
            <ButtonBase
              sx={{
                ...buttonSx,
                borderRadius: '50%',
                width: 39,
                height: 39,
                bgcolor: 'primary.light',
                color: 'text.primary',
                fontWeight: 700,
                '&:hover': { bgcolor: 'primary.main', color: 'primary.contrastText' },
              }}
              aria-label="החשבון שלי"
              onClick={(event) => {
                setAccountAnchor(event.currentTarget);
                setPanel('account');
              }}
            >
              {data.me.name[0]}
              {data.me.surname[0]}
            </ButtonBase>
          </Box>
        </Box>
      </Box>
      <Box component="main" sx={{ ...shellWidth, pt: '20px', pb: '44px' }}>
        <ErrorLine error={error} />
        {page === 'home' ? (
          <Home data={data} saved={saved} />
        ) : page === 'stations' ? (
          <Stations data={data} saved={saved} />
        ) : page === 'calendar' ? (
          <Calendar data={data} saved={saved} />
        ) : data.me.role === 'admin' ? (
          <Users />
        ) : (
          <Home data={data} saved={saved} />
        )}
      </Box>
      {panel === 'account' && (
        <Account
          me={data.me}
          anchor={accountAnchor}
          close={() => setPanel(null)}
          logout={async () => {
            await api('auth/logout', {});
            setPanel(null);
            location.hash = 'home';
            await refresh();
          }}
        />
      )}
      {panel === 'notices' && (
        <Modal title="התראות" close={() => setPanel(null)}>
          <Box sx={stackSx}>
            {!data.notices.length && <Typography variant="body1">אין התראות חדשות.</Typography>}
            {unread > 0 && (
              <Button
                sx={buttonSx}
                onClick={() =>
                  action.run(async () => {
                    await api('notices/read', { through: data.notices[0].id });
                    await refresh();
                  })
                }
              >
                סימון הכול כנקרא
              </Button>
            )}
            <ErrorLine error={action.error} />
            {data.notices.map((n) => (
              <Box
                component="article"
                sx={{
                  ...insetSx,
                  borderInlineStart: n.seen ? undefined : '3px solid',
                  borderColor: 'primary.main',
                }}
                key={n.id}
              >
                <strong>{n.message}</strong>
                <Typography
                  variant="body1"
                  component="p"
                  sx={{ fontSize: '.94rem', color: 'text.secondary', mt: '5px' }}
                >
                  <bdi>
                    {shortDate(n.created)} · {clock(n.created)}
                  </bdi>
                </Typography>
              </Box>
            ))}
          </Box>
        </Modal>
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
