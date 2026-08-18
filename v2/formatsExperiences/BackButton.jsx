/**
 * Shared icon-only back control for Formats & Experiences surfaces.
 */

import { IconChevronLeft } from '../icons.jsx';

/**
 * @param {{
 *   onClick: () => void,
 *   label?: string,
 *   className?: string,
 * }} props
 */
export default function BackButton({
  onClick,
  label = 'Back',
  className = '',
}) {
  return (
    <button
      type="button"
      className={`v2-fe-back${className ? ` ${className}` : ''}`}
      aria-label={label}
      onClick={onClick}
    >
      <IconChevronLeft width={18} height={18} aria-hidden="true" />
    </button>
  );
}
