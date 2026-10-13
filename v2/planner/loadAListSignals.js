/**
 * A-List-specific data feeds; loaded lazily only when the report expands.
 * Other site routes do not depend on these experimental artifacts.
 */
import { resolveV2DataUrl } from '../data/v2DataUrl.js';
async function optionalJson(path, fetchImpl) {
  try {
    const response = await fetchImpl(resolveV2DataUrl(path));
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
export async function loadAListSignals(fetchImpl=fetch) {
  const [catalog,comingSoon,shadow]=await Promise.all([
    optionalJson('/data/a_list_catalog_current.json',fetchImpl),
    optionalJson('/data/coming_soon_current.json',fetchImpl),
    optionalJson('/data/a_list_run_forecast_current.json',fetchImpl),
  ]);
  return {catalog,comingSoon,shadow};
}
