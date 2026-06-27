import { createContext, createElement, useContext, useEffect, useState } from 'react';
import { loadPipelineReportArtifactOnce } from '../utils/pipelineReportLoader.js';
import {
  normalizePipelineReport,
  PIPELINE_STATUS_UNAVAILABLE,
} from '../utils/pipelineReport.js';

const PipelineReportContext = createContext(null);

function usePipelineReportState() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    loadPipelineReportArtifactOnce()
      .then((artifact) => {
        if (cancelled) return;
        setReport(normalizePipelineReport(artifact));
      })
      .catch(() => {
        if (!cancelled) setError(PIPELINE_STATUS_UNAVAILABLE);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { report, loading, error };
}

export function PipelineReportProvider({ children }) {
  const value = usePipelineReportState();
  return createElement(PipelineReportContext.Provider, { value }, children);
}

export function usePipelineReport() {
  const value = useContext(PipelineReportContext);
  if (!value) {
    throw new Error('usePipelineReport must be used within PipelineReportProvider');
  }
  return value;
}
