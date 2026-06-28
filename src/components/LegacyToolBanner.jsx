import { Link } from 'react-router-dom';

/**
 * Soft migration banner for legacy planning tools during the transition to /planner.
 */
export default function LegacyToolBanner({ label, message, linkTo, linkText }) {
  return (
    <aside className="legacy-tool-banner" role="note" aria-label={label}>
      <div className="legacy-tool-banner-content">
        <span className="legacy-tool-banner-label">{label}</span>
        <p className="legacy-tool-banner-message">{message}</p>
      </div>
      <Link className="legacy-tool-banner-link" to={linkTo}>
        {linkText}
      </Link>
    </aside>
  );
}
