import { useEffect, useState } from 'react';
import { loadRecentlyAddedArtifactOnce } from '../utils/recentlyAddedLoader.js';

export function useRecentlyAdded() {
  const [artifact, setArtifact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    loadRecentlyAddedArtifactOnce()
      .then((loaded) => {
        if (!cancelled) setArtifact(loaded);
      })
      .catch(() => {
        if (!cancelled) setError('Recently added data unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { artifact, loading, error };
}
