import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data with loading and error state. `reload()` refreshes silently (no skeleton flash);
 * `retry()` shows the loading state again.
 */
export function useQuery(fetcher, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const sequence = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback((silent = false) => {
    const id = ++sequence.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    return fetcher().then(
      (data) => id === sequence.current && setState({ data, error: null, loading: false }),
      (error) => id === sequence.current && setState({ data: undefined, error, loading: false }),
    );
  }, deps);

  useEffect(() => {
    load();
    return () => {
      sequence.current += 1;
    };
  }, [load]);

  return { ...state, reload: () => load(true), retry: () => load(false) };
}
