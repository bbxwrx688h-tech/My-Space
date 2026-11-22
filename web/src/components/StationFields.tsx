import { InputBase, NativeSelect } from '@mui/material';
import { textInputSx, selectSx } from '../layout';
import { sites, Site } from '../../../shared/model';
import { Field } from './Fields';

export function SiteSelect({
  value,
  onChange,
  all,
}: {
  value: string;
  onChange: (v: string) => void;
  all?: boolean;
}) {
  return (
    <Field label="אתר">
      <NativeSelect
        disableUnderline
        sx={selectSx}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {all && <option value="">כל האתרים</option>}
        {sites.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </NativeSelect>
    </Field>
  );
}
export function StationFields({ site }: { site: Site }) {
  return (
    <>
      <Field label="אתר העמדה">
        <NativeSelect
          disableUnderline
          inputProps={{ name: 'site' }}
          sx={selectSx}
          defaultValue={site}
        >
          {sites.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="מספר חדר">
        <InputBase inputProps={{ maxLength: 150 }} sx={textInputSx} required name="room" />
      </Field>
      <Field label="מערכת הפעלה">
        <NativeSelect disableUnderline inputProps={{ name: 'os' }} sx={selectSx}>
          <option>Windows</option>
          <option>Linux</option>
        </NativeSelect>
      </Field>
      <Field label="תיאור העמדה">
        <InputBase
          multiline
          minRows={3}
          inputProps={{ maxLength: 2000 }}
          sx={textInputSx}
          required
          name="description"
          placeholder="למשל, השולחן ליד החלון"
        />
      </Field>
    </>
  );
}
export function stationFrom(form: FormData) {
  return {
    site: form.get('site'),
    room: form.get('room'),
    os: form.get('os'),
    description: form.get('description'),
  };
}
