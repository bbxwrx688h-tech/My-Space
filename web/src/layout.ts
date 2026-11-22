import { alpha } from '@mui/material/styles';
import { colors } from './colors';

// Shared layout patterns. Page-specific spacing and states live on the component that owns them.
export const stackSx = { display: 'grid', gap: 2 } as const;
export const rowSx = { display: 'flex', alignItems: 'center', gap: 1.5 } as const;
export const pairSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
  gap: { xs: 1, sm: 2 },
} as const;
export const panelSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: '14px',
  bgcolor: 'background.paper',
  p: { xs: '14px', sm: '21px 24px' },
} as const;
export const filterBarSx = {
  ...panelSx,
  ...rowSx,
  flexWrap: 'wrap',
  alignItems: 'end',
  mb: '18px',
  '& > label, & > [role="group"]': { minWidth: { xs: 110, sm: 150 }, flexGrow: { xs: 1, sm: 0 } },
} as const;
export const pageHeadingSx = {
  ...rowSx,
  justifyContent: 'space-between',
  mb: '22px',
  '@media (max-width:800px)': { flexWrap: 'wrap', alignItems: 'flex-start' },
} as const;
export const subtitleSx = { mt: '5px', color: 'text.secondary', fontSize: '1.13rem' } as const;
export const entrySx = {
  minHeight: '100dvh',
  display: 'grid',
  placeItems: 'center',
  p: 3,
} as const;
export const entryPanelSx = {
  ...panelSx,
  width: 'min(100%, 460px)',
  p: { xs: 3, sm: 4.5 },
  borderRadius: '18px',
  boxShadow: `0 10px 36px ${alpha(colors.midnight, 0.08)}`,
} as const;
export const entryHeadingSx = { fontSize: '2.2rem', mt: '30px', mb: '10px' } as const;
export const insetSx = {
  borderRadius: '9px',
  p: 1.5,
  bgcolor: 'action.hover',
  overflowWrap: 'anywhere',
} as const;
export const warningSx = {
  ...insetSx,
  bgcolor: 'secondary.main',
  color: 'secondary.contrastText',
} as const;
export const fieldSx = { display: 'grid', gap: '6px', minWidth: 0 } as const;
export const fieldLabelSx = { fontWeight: 600, fontSize: '.94rem' } as const;
export const controlSx = {
  width: '100%',
  minHeight: 42,
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'primary.light',
  '&.Mui-focused, &:focus-visible': { outline: `3px solid ${colors.slate}`, outlineOffset: '2px' },
  borderRadius: '8px',
} as const;
export const buttonSx = {
  touchAction: 'manipulation',
  '&:active': { transform: 'scale(.985)' },
} as const;
export const textInputSx = {
  ...controlSx,
  px: 1.5,
  py: '8px',
  '& .MuiInputBase-input': { p: 0 },
} as const;
export const selectSx = {
  ...controlSx,
  '& .MuiNativeSelect-select': {
    py: '9px',
    paddingInlineStart: '12px',
    paddingInlineEnd: '32px',
    borderRadius: '8px',
  },
} as const;
