/**
 * Shared primary-page header for Explore, Planner, and Profile.
 *
 * @param {{
 *   title: string,
 *   subtitle?: string | null,
 *   titleId?: string,
 *   action?: import('react').ReactNode,
 *   children?: import('react').ReactNode,
 *   className?: string,
 *   titleClassName?: string,
 *   subtitleClassName?: string,
 * }} props
 */
export default function PageHeader({
  title,
  subtitle = null,
  titleId = 'v2-page-title',
  action = null,
  children = null,
  className = '',
  titleClassName = '',
  subtitleClassName = '',
  ...rest
}) {
  return (
    <header
      className={`v2-page-header${className ? ` ${className}` : ''}`}
      {...rest}
    >
      <div className="v2-page-header-text">
        <h1
          id={titleId}
          className={`v2-page-title${titleClassName ? ` ${titleClassName}` : ''}`}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            className={`v2-page-subtitle${subtitleClassName ? ` ${subtitleClassName}` : ''}`}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="v2-page-header-action">{action}</div> : null}
      {children}
    </header>
  );
}
