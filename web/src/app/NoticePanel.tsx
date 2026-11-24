import { Box, Button, Typography } from '@mui/material';
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
        {notices.map((n) => (
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
  );
}
