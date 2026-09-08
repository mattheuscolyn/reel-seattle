import { IconChevronLeft } from '../icons.jsx';

/**
 * Shared header back control for nested screens.
 * Label is visible when space permits; the accessible name always includes it.
 *
 * @param {{
 *   onClick: () => void,
 *   label?: string | null,
 *   className?: string,
 * }} props
 */
export default function BackButton({
  onClick,
  label = null,
  className = '',
}) {
  const accessible = label ? `Back to ${label}` : 'Back';
  return (
    <button
      type="button"
      className={`v2-header-back${className ? ` ${className}` : ''}`}
      aria-label={accessible}
      onClick={onClick}
    >
      <IconChevronLeft width={20} height={20} aria-hidden="true" />
      {label ? (
        <span className="v2-header-back-label">{label}</span>
      ) : null}
    </button>
  );
}
