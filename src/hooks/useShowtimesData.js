import { createContext, createElement, useContext, useEffect, useState } from 'react';
import {
  rowsFromShowtimesCurrent,
  sourceInfoFromArtifact,
  SHOWTIMES_LOAD_ERROR,
} from '../showtimesAdapter.js';
import { isShowtimeCanceled } from '../utils/showtimeFilters.js';
import { loadShowtimesArtifactOnce } from '../utils/showtimesLoader.js';

const ShowtimesDataContext = createContext(null);

function useShowtimesDataState() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sourceInfo, setSourceInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;

    loadShowtimesArtifactOnce()
      .then((artifact) => {
        if (cancelled) return;
        const parsedRows = rowsFromShowtimesCurrent(artifact).filter(
          (row) => row.Date && row.Film && !isShowtimeCanceled(row),
        );
        setRows(parsedRows);
        setSourceInfo(sourceInfoFromArtifact(artifact));
      })
      .catch(() => {
        if (!cancelled) setError(SHOWTIMES_LOAD_ERROR);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, loading, error, sourceInfo };
}

export function ShowtimesDataProvider({ children }) {
  const value = useShowtimesDataState();
  return createElement(ShowtimesDataContext.Provider, { value }, children);
}

export function useShowtimesData() {
  const value = useContext(ShowtimesDataContext);
  if (!value) {
    throw new Error('useShowtimesData must be used within ShowtimesDataProvider');
  }
  return value;
}
