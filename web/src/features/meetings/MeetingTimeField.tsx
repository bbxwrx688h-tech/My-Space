import { Box, NativeSelect, Typography } from '@mui/material';
import { selectSx } from '@app/layout';
import { slotMinuteOptions, slots } from '@app/dates';

export function TimeField({
  label,
  value,
  min,
  end,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  end?: boolean;
  onChange: (value: string) => void;
}) {
  const options = end ? [...slots.slice(1), '24:00'] : slots;
  const allowed = options.filter((time) => !min || time > min);
  const [hour, minute] = value.split(':');
  const hours = [...new Set(allowed.map((time) => time.slice(0, 2)))];
  return (
    <Box role="group" aria-label={label}>
      <Typography sx={{ fontWeight: 600, fontSize: '.94rem', mb: '6px' }}>{label}</Typography>
      <Box sx={{ display: 'flex', gap: 1 }} dir="ltr">
        <NativeSelect
          disableUnderline
          inputProps={{ 'aria-label': label + ' שעות' }}
          sx={selectSx}
          value={hour}
          onChange={(event) => {
            const next =
              allowed.find((time) => time === event.target.value + ':' + minute) ||
              allowed.find((time) => time.startsWith(event.target.value + ':'));
            if (next) onChange(next);
          }}
        >
          {!hours.includes(hour) && (
            <option value={hour} disabled>
              {hour}
            </option>
          )}
          {hours.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          disableUnderline
          inputProps={{ 'aria-label': label + ' דקות' }}
          sx={selectSx}
          value={minute}
          onChange={(event) => onChange(hour + ':' + event.target.value)}
        >
          {slotMinuteOptions.map((m) => (
            <option key={m} value={m} disabled={!allowed.includes(hour + ':' + m)}>
              {m}
            </option>
          ))}
        </NativeSelect>
      </Box>
    </Box>
  );
}
