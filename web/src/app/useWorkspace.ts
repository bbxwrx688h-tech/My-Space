import { useCallback, useEffect, useRef, useState } from 'react';
import { Workspace } from '@shared/model';
import { ApiError } from '@app/api';
import { endpoints } from '@app/endpoints';

export function useWorkspace({
  onSaved,
  onUnauthorized,
}: {
  onSaved: () => void;
  onUnauthorized: () => void;
}) {
  const [data, setData] = useState<Workspace | null | undefined>(undefined);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  // Keep refresh stable while letting it reach the current UI callbacks.
  const callbacks = useRef({ onSaved, onUnauthorized });
  callbacks.current = { onSaved, onUnauthorized };

  const refresh = useCallback(async () => {
    // A slow poll must never overwrite a newer mutation refresh or sign-out.
    const version = ++sequence.current;
    try {
      const value = await endpoints.workspace.get();
      if (version === sequence.current) {
        setData(value);
        setError('');
      }
    } catch (e) {
      if (version !== sequence.current) return;
      if (e instanceof ApiError && e.status === 401) {
        setData(null);
        callbacks.current.onUnauthorized();
        setError('');
      } else setError((e as Error).message);
    }
  }, []);

  const saved = useCallback(async () => {
    await refresh();
    callbacks.current.onSaved();
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const authenticated = !!data;
  useEffect(() => {
    if (!authenticated) return;
    // Refresh availability and notices periodically and when returning to the tab.
    const poll = () => {
      if (!document.hidden) void refresh();
    };
    const timer = setInterval(poll, 15000);
    window.addEventListener('focus', poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', poll);
    };
  }, [authenticated, refresh]);

  return { data, error, refresh, saved };
}
