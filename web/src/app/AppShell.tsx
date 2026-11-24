import { Badge, Box, ButtonBase, IconButton, Link } from '@mui/material';
import { Bell } from 'lucide-react';
import { Workspace } from '@shared/model';
import { rowSx, buttonSx } from '@app/layout';
import { ErrorLine } from '@app/components/Fields';
import { Calendar } from '@app/pages/Calendar';
import { Home } from '@app/pages/Home';
import { Requests } from '@app/pages/Requests';
import { Stations } from '@app/pages/Stations';
import { Users } from '@app/pages/Users';
import { Brand } from '@app/components/Fields';
import { pages, Page } from './useHashRoute';

const shellWidth = { width: { xs: '94%', sm: 'min(92%,1440px)' }, mx: 'auto' } as const;

export function AppShell({
  data,
  page,
  unread,
  error,
  saved,
  onNotices,
  onAccount,
}: {
  data: Workspace;
  page: Page;
  unread: number;
  error: string;
  saved: () => Promise<void>;
  onNotices: () => void;
  onAccount: (anchor: HTMLElement) => void;
}) {
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
            gap: 'clamp(1rem,3vw,3rem)',
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
              flexWrap: 'wrap',
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
            <IconButton sx={{ color: 'inherit' }} aria-label="התראות" onClick={onNotices}>
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
              onClick={(event) => onAccount(event.currentTarget)}
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
        ) : page === 'requests' ? (
          <Requests data={data} saved={saved} />
        ) : data.me.role === 'admin' ? (
          <Users saved={saved} />
        ) : (
          <Home data={data} saved={saved} />
        )}
      </Box>
    </>
  );
}
