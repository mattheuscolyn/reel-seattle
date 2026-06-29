/**
 * Shared loading, error, and empty state panel for data-driven pages.
 */
export default function DataStatePanel({
  variant = 'loading',
  title,
  message,
  className = '',
}) {
  const role = variant === 'error' ? 'alert' : 'status';

  return (
    <div className={`data-state data-state--${variant} ${className}`.trim()} role={role}>
      {variant === 'loading' ? (
        <span className="loading-spinner-large" aria-hidden="true" />
      ) : null}
      {title ? <p className="data-state-title">{title}</p> : null}
      {message ? <p className="data-state-message">{message}</p> : null}
    </div>
  );
}
