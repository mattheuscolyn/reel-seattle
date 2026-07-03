export function isShowtimeCanceled(row) {
  const value = row?.isCanceled;
  if (value == null || value === '') return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function showtimeSlot(row) {
  return {
    time: row.Time,
    premiumFormat: (row.premiumFormat || '').trim(),
    screeningVariant: (row.screening_variant_type || '').trim(),
  };
}
