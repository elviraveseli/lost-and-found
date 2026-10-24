import { useCallback, useEffect, useState } from 'react';

// Runs an async loader and tracks loading / error / data, re-running when `deps`
// change. `reload()` runs it again (e.g. after a mutation). Results of outdated
// requests are ignored so fast filter changes cannot show stale data.
export function useAsync(loader, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: null, meta: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    loader()
      .then((res) => active && setState({ loading: false, error: null, data: res.data, meta: res.meta ?? null }))
      .catch((error) => active && setState({ loading: false, error, data: null, meta: null }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
