import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  InputBase,
  NativeSelect,
  Typography,
} from '@mui/material';
import { DirectoryPerson, Meeting, Workspace } from '@shared/model';
import { stackSx, pairSx, buttonSx, textInputSx, selectSx } from '@app/layout';
import { DateField, ErrorLine, Field } from '@app/components/Fields';
import { InviteePicker } from './InviteePicker';
import { TimeField } from './MeetingTimeField';

export interface MeetingFormFields {
  date: string;
  roomId: number;
  setRoomId: (roomId: number) => void;
  from: string;
  until: string;
  setUntil: (value: string) => void;
  title: string;
  setTitle: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  isPrivate: boolean;
  setPrivate: (value: boolean) => void;
  visit: boolean;
  setVisit: (value: boolean) => void;
  invitees: DirectoryPerson[];
  setInvitees: (people: DirectoryPerson[]) => void;
  attendeesLoaded: boolean;
  attendeesLoadFailed: boolean;
  recurrence: 'none' | 'daily' | 'weekly';
  setRecurrence: (value: 'none' | 'daily' | 'weekly') => void;
  editScope: 'single' | 'following';
  setEditScope: (value: 'single' | 'following') => void;
  recurrenceEnd: 'count' | 'date';
  setRecurrenceEnd: (value: 'count' | 'date') => void;
  count: number;
  setCount: (value: number) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  dateMin: string;
  dateMax?: string;
  startMin?: string;
  onDateChange: (day: string) => void;
  onStartChange: (value: string) => void;
}

export interface MeetingFormProps {
  data: Workspace;
  meeting?: Meeting;
  busy: boolean;
  fields: MeetingFormFields;
  onSubmit: () => void;
}

export function MeetingForm({ data, meeting, busy, fields, onSubmit }: MeetingFormProps) {
  const {
    date,
    roomId,
    setRoomId,
    from,
    until,
    setUntil,
    title,
    setTitle,
    description,
    setDescription,
    isPrivate,
    setPrivate,
    visit,
    setVisit,
    invitees,
    setInvitees,
    attendeesLoaded,
    attendeesLoadFailed,
    recurrence,
    setRecurrence,
    editScope,
    setEditScope,
    recurrenceEnd,
    setRecurrenceEnd,
    count,
    setCount,
    endDate,
    setEndDate,
    dateMin,
    dateMax,
    startMin,
    onDateChange,
    onStartChange,
  } = fields;
  return (
    <Box
      component="form"
      sx={stackSx}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Typography variant="body1" sx={{ color: 'text.secondary' }}>
        שעון ירושלים
      </Typography>
      <Field label="חדר ישיבות">
        <NativeSelect
          disableUnderline
          sx={selectSx}
          value={roomId}
          onChange={(event) => setRoomId(Number(event.target.value))}
        >
          {data.rooms.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} · {option.site}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="כותרת הפגישה">
        <InputBase
          inputProps={{ maxLength: 150 }}
          sx={textInputSx}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <DateField
        label="תאריך הפגישה"
        value={date}
        min={dateMin}
        max={dateMax}
        workdaysOnly
        onChange={onDateChange}
      />
      <Box sx={pairSx}>
        <TimeField label="שעת התחלה" value={from} min={startMin} onChange={onStartChange} />
        <TimeField label="שעת סיום" value={until} min={from} end onChange={setUntil} />
      </Box>
      <Field label="תיאור הפגישה">
        <InputBase
          multiline
          minRows={3}
          inputProps={{ maxLength: 2000 }}
          sx={textInputSx}
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <FormControlLabel
        control={
          <Checkbox checked={isPrivate} onChange={(event) => setPrivate(event.target.checked)} />
        }
        label="פגישה פרטית"
      />
      <FormControlLabel
        control={<Checkbox checked={visit} onChange={(event) => setVisit(event.target.checked)} />}
        label="פגישה במסגרת ביקור"
      />
      {meeting?.seriesId && (data.me.role === 'boss' || data.me.role === 'admin') && (
        <Box sx={stackSx}>
          <Field label="היקף השינוי">
            <NativeSelect
              disableUnderline
              sx={selectSx}
              value={editScope}
              onChange={(event) => setEditScope(event.target.value as typeof editScope)}
            >
              <option value="single">פגישה זו בלבד</option>
              <option value="following">פגישה זו והבאות בסדרה</option>
            </NativeSelect>
          </Field>
          {editScope === 'following' && (
            <Typography color="text.secondary">
              פרטי הטופס יחולו על הפגישה הזו ועל הפגישות הבאות בסדרה.
            </Typography>
          )}
        </Box>
      )}
      <InviteePicker value={invitees} onChange={setInvitees} />
      {attendeesLoadFailed && (
        <ErrorLine error="לא ניתן לטעון את המוזמנים. יש לסגור את הפגישה ולפתוח אותה מחדש." />
      )}
      {!meeting && (data.me.role === 'boss' || data.me.role === 'admin') && (
        <Box sx={stackSx}>
          <Field label="חזרה על הפגישה">
            <NativeSelect
              disableUnderline
              sx={selectSx}
              value={recurrence}
              onChange={(event) => setRecurrence(event.target.value as typeof recurrence)}
            >
              <option value="none">ללא חזרה</option>
              <option value="daily">ימי עבודה</option>
              <option value="weekly">כל שבוע</option>
            </NativeSelect>
          </Field>
          {recurrence !== 'none' && (
            <>
              <Field label="סיום הסדרה">
                <NativeSelect
                  disableUnderline
                  sx={selectSx}
                  value={recurrenceEnd}
                  onChange={(event) => setRecurrenceEnd(event.target.value as typeof recurrenceEnd)}
                >
                  <option value="count">לפי מספר פגישות</option>
                  <option value="date">לפי תאריך</option>
                </NativeSelect>
              </Field>
              {recurrenceEnd === 'count' ? (
                <Field label="מספר הפגישות">
                  <InputBase
                    type="number"
                    required
                    sx={textInputSx}
                    inputProps={{ min: 1 }}
                    value={count}
                    onChange={(event) => setCount(Number(event.target.value))}
                  />
                </Field>
              ) : (
                <DateField
                  label="תאריך סיום הסדרה"
                  value={endDate}
                  min={date}
                  onChange={setEndDate}
                />
              )}
            </>
          )}
        </Box>
      )}
      <Button
        sx={buttonSx}
        variant="contained"
        type="submit"
        disabled={busy || !attendeesLoaded || attendeesLoadFailed}
      >
        {meeting
          ? 'שמירת שינויים'
          : data.me.role === 'manager'
            ? 'שליחת בקשת פגישה'
            : 'הוספת פגישה'}
      </Button>
    </Box>
  );
}
