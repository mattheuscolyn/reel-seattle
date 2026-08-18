/**
 * Abstract format tile art — no scraped brand logos.
 */

/**
 * @param {{
 *   tone?: string,
 *   label?: string,
 *   size?: 'sm' | 'md' | 'lg',
 *   className?: string,
 * }} props
 */
export function FormatTile({
  tone = 'default',
  label = '',
  size = 'md',
  className = '',
}) {
  return (
    <span
      className={`v2-fe-tile v2-fe-tile-${tone} v2-fe-tile-${size}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <span className="v2-fe-tile-label">{label}</span>
    </span>
  );
}
