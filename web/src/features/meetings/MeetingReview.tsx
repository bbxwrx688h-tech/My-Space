import { Box, Button, Typography } from '@mui/material';
import { Review } from '@shared/model';
import { clock, endClock, fullDate } from '@app/dates';
import { stackSx, rowSx, insetSx, buttonSx } from '@app/layout';

export interface MeetingReviewProps {
  review: Review;
  seconds: number;
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

export function MeetingReview({ review, seconds, busy, onConfirm, onBack }: MeetingReviewProps) {
  return (
    <Box sx={stackSx}>
      <Typography variant="body1">הפעולה תשנה או תבטל את הפגישות והבקשות המפורטות להלן.</Typography>
      {review.affected.map((m) => (
        <Box sx={insetSx} key={m.id}>
          <strong>{m.title}</strong>
          <Typography
            variant="body1"
            component="p"
            sx={{ fontSize: '.94rem', color: 'text.secondary', mt: '5px' }}
          >
            {m.organizer} · {fullDate(m.start)} ·{' '}
            <bdi>
              {clock(m.start)}–{endClock(m.start, m.end)}
            </bdi>
          </Typography>
        </Box>
      ))}
      <Box sx={rowSx}>
        <Button
          sx={buttonSx}
          variant="contained"
          disabled={seconds > 0 || busy}
          onClick={onConfirm}
        >
          {seconds ? 'אישור בעוד ' + seconds + ' שניות' : 'אישור השינוי'}
        </Button>
        <Button sx={buttonSx} onClick={onBack}>
          חזרה
        </Button>
      </Box>
    </Box>
  );
}
