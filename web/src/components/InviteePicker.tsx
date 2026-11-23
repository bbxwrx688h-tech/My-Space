import { Autocomplete, Box, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import { DirectoryPerson } from '../../../shared/model';
import { api } from '../api';
import { ErrorLine } from './Fields';

export function InviteePicker({
  value,
  onChange,
}: {
  value: DirectoryPerson[];
  onChange: (people: DirectoryPerson[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<DirectoryPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    let current = true;
    setResults([]);
    setLoading(true);
    // Ignore stale responses when a newer search has already been typed.
    const timer = setTimeout(() => {
      api<DirectoryPerson[]>('people/search?q=' + encodeURIComponent(search.trim()))
        .then((people) => {
          if (current) {
            setResults(people);
            setError('');
          }
        })
        .catch((reason: Error) => {
          if (current) setError(reason.message);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [search]);
  return (
    <Box>
      <Autocomplete
        multiple
        options={results}
        value={value}
        loading={loading}
        loadingText="מחפש משתמשים…"
        getOptionLabel={(person) => `${person.name} ${person.surname} · ${person.upn}`}
        isOptionEqualToValue={(option, person) => option.id === person.id}
        filterOptions={(options) => options}
        onChange={(_, people) => onChange(people)}
        onInputChange={(_, text, reason) => {
          if (reason === 'input' || reason === 'clear') setSearch(text);
        }}
        noOptionsText={search.trim() ? 'לא נמצאו משתמשים במערכת' : 'יש להקליד שם או כתובת דוא״ל'}
        renderInput={(params) => (
          <TextField {...params} label="הזמנת משתתפים" placeholder="חיפוש לפי שם או דוא״ל" />
        )}
      />
      <ErrorLine error={error} />
    </Box>
  );
}
