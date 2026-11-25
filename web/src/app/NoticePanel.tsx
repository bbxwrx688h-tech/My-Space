import { Box, Button, ButtonBase, Typography } from '@mui/material';
import { useState } from 'react';
import { Notice } from '@shared/model';
import { stackSx, insetSx, buttonSx } from '@app/layout';
import { ErrorLine, Modal } from '@app/components/Fields';
import { clock, shortDate } from '@app/dates';

export function NoticePanel({
  notices,
  error,
  onMarkRead,
  close,
}: {
  notices: Notice[];
  error: string;
  onMarkRead: () => void;
  close: () => void;
}) {
  const [selected, setSelected] = useState<Notice | null>(null);
  const unread = notices.filter((n) => !n.seen).length;
  return (
    <Modal title="התראות" close={close}>
      <Box sx={stackSx}>
        {!notices.length && <Typography variant="body1">אין התראות חדשות.</Typography>}
        {unread > 0 && (
          <Button sx={buttonSx} onClick={onMarkRead}>
            סימון הכול כנקרא
          </Button>
        )}
        <ErrorLine error={error} />
        {selected ? (
          <Box sx={insetSx}>
            <Typography sx={{ fontWeight: 700 }}>{selected.message}</Typography>
            <Typography sx={{ color: 'text.secondary', mt: 1 }}>
              <bdi>
                {shortDate(selected.created)} · {clock(selected.created)}
              </bdi>
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
              {selected.targetType && selected.targetId && (
                <Button
                  href={`#${selected.targetType === 'offer' ? 'stations' : 'requests'}?target=${selected.targetType}&id=${selected.targetId}`}
                  onClick={close}
                >
                  מעבר לפרטים
                </Button>
              )}
              {!selected.targetType && <Typography>אין קישור לפרטים עבור התראה זו.</Typography>}
              <Button onClick={() => setSelected(null)}>חזרה להתראות</Button>
            </Box>
          </Box>
        ) : (
          notices.map((n) => (
            <ButtonBase
              onClick={() => setSelected(n)}
              sx={{
                ...insetSx,
                display: 'block',
                textAlign: 'start',
                width: '100%',
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
            </ButtonBase>
          ))
        )}
      </Box>
    </Modal>
  );
}
