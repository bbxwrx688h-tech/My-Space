import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Popover,
} from '@mui/material';
import { rowSx, fieldSx, fieldLabelSx, controlSx, buttonSx } from '../layout';
import { ReactNode, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { local, now, shortDate } from '../dates';

export function Brand() {
  return (
    <Box
      component="span"
      dir="ltr"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        gap: '10px',
        color: 'inherit',
        fontSize: { xs: '1.4rem', sm: '1.75rem' },
        letterSpacing: '-.025em',
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 60 60"
        aria-hidden="true"
        sx={{ display: 'block', width: '44px', height: '44px', flex: '0 0 44px' }}
      >
        {/* The back and front arcs give the stationary orbit depth around the building. */}
        <path
          d="M5 38C2 32 11 23 25 18S51 13 55 19"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          opacity="0.45"
        />
        <path fill="currentColor" opacity="0.65" d="M18 20 29 15v29l-11 3z" />
        <path fill="currentColor" d="M29 15 41 19v27l-12-2z" />
        <path
          d="M23 23v19M26 21v21M33 22v19M37 23v19"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.3"
        />
        <path
          d="M5 38c4 6 17 5 31 0s22-13 19-19"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* A small angled rocket sits on the near side of the orbit. */}
        <g transform="translate(43 34) rotate(52)">
          <path d="M0-9C3-7 4-3 4 1L2 5H-2L-4 1C-4-3-3-7 0-9Z" fill="currentColor" />
          <path d="M-4 0-7 4-3 3M4 0l3 4-4-1" fill="currentColor" opacity="0.7" />
          <circle cy="-3" r="1.4" fill="#415a77" />
          <path d="M-1 6 0 9 1 6" fill="none" stroke="currentColor" strokeWidth="1" />
        </g>
      </Box>
      <b dir="ltr">My-Space</b>
    </Box>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      slotProps={{ paper: { sx: { borderRadius: '16px' } } }}
      open
      onClose={close}
      fullWidth
      maxWidth="sm"
      aria-label={title}
    >
      <DialogTitle sx={{ ...rowSx, justifyContent: 'space-between' }}>
        {title}
        <IconButton aria-label="סגירה" onClick={close}>
          <X />
        </IconButton>
      </DialogTitle>
      <DialogContent>{children}</DialogContent>
    </Dialog>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box component="label" sx={fieldSx}>
      <Box component="span" sx={fieldLabelSx}>
        {label}
      </Box>
      {children}
    </Box>
  );
}
export function ErrorLine({ error }: { error: string }) {
  return error ? <Alert severity="error">{error}</Alert> : null;
}
// Handles submission errors inside the form that caused them and keeps input intact.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  workdaysOnly,
  clearable,
}: {
  label: string;
  value: string;
  onChange: (day: string) => void;
  min?: string;
  max?: string;
  workdaysOnly?: boolean;
  clearable?: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [month, setMonth] = useState(now().startOf('month'));
  const offset = month.weekday % 7;
  function choose(day: string) {
    onChange(day);
    setAnchor(null);
  }
  return (
    <Box role="group" sx={fieldSx}>
      <Box component="span" sx={fieldLabelSx}>
        {label}
      </Box>
      <ButtonBase
        sx={{ ...controlSx, ...rowSx, justifyContent: 'space-between', px: 1.5 }}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={(e) => {
          setMonth((value ? local(value) : now()).startOf('month'));
          setAnchor(e.currentTarget);
        }}
      >
        <bdi>{value ? shortDate(value) : 'בחירת תאריך'}</bdi>
        <CalendarDays size={17} />
      </ButtonBase>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1.5, width: 286 }} role="dialog" aria-label={label}>
          <Box sx={{ ...rowSx, justifyContent: 'space-between' }}>
            <IconButton aria-label="חודש קודם" onClick={() => setMonth(month.minus({ months: 1 }))}>
              <ChevronRight />
            </IconButton>
            <strong>{month.toFormat('LLLL yyyy')}</strong>
            <IconButton aria-label="חודש הבא" onClick={() => setMonth(month.plus({ months: 1 }))}>
              <ChevronLeft />
            </IconButton>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7,1fr)',
              textAlign: 'center',
              gap: '2px',
            }}
          >
            {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((d) => (
              <Box component="b" sx={{ p: '5px' }} key={d}>
                {d}
              </Box>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <Box component="span" key={'gap' + i} />
            ))}
            {Array.from({ length: month.daysInMonth! }, (_, i) => {
              const day = month.plus({ days: i }).toISODate()!;
              return (
                <ButtonBase
                  sx={{
                    borderRadius: '6px',
                    p: '8px 2px',
                    bgcolor: value === day ? 'primary.main' : 'background.paper',
                    color: value === day ? 'primary.contrastText' : 'text.primary',
                    '&:hover': { bgcolor: value === day ? 'primary.dark' : 'action.hover' },
                    '&.Mui-disabled': { color: 'text.disabled' },
                  }}
                  type="button"
                  key={day}
                  aria-label={shortDate(day)}
                  aria-pressed={value === day}
                  disabled={Boolean(
                    (min && day < min) ||
                    (max && day > max) ||
                    (workdaysOnly && [5, 6].includes(local(day).weekday)),
                  )}
                  onClick={() => choose(day)}
                >
                  {i + 1}
                </ButtonBase>
              );
            })}
          </Box>
          {clearable && (
            <Button sx={buttonSx} onClick={() => choose('')}>
              ניקוי
            </Button>
          )}
        </Box>
      </Popover>
    </Box>
  );
}
