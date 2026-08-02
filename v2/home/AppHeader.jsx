import {
  IconProfile,
  IconSettings,
  IconShare,
} from '../icons.jsx';

/**
 * Top application header.
 * Modes:
 * - default: wordmark + profile
 * - profile destination: wordmark + settings (mockup gear)
 * - search back: ← Explore
 * - film detail: ← Origin · wordmark (Save/Share live in the surface, not the header)
 * - build-plan: chevron back · wordmark · empty trailing spacer / Share
 * - plan-details: chevron back · centered Plan Details · Share icon
 */
export default function AppHeader({
  onProfileClick,
  onSettingsClick = null,
  headerMode = 'default',
  backLabel = null,
  onBack = null,
  backStyle = 'label',
  variant = 'default',
  shareTitle = null,
  onShare = null,
  shareStatus = null,
  onSave = null,
  savePressed = false,
  saveAvailable = true,
  saveLabel = 'Save',
  centerTitle = null,
}) {
  const isFilmDetail = variant === 'film-detail';
  const showSettings =
    headerMode === 'profile' && typeof onSettingsClick === 'function';
  const showPlanDetailsChrome = headerMode === 'plan-details';
  const showBuildPlanChrome =
    headerMode === 'build-plan' || showPlanDetailsChrome;
  const showBack = typeof onBack === 'function' && (backLabel || showBuildPlanChrome);
  const chevronOnly = backStyle === 'chevron' || showBuildPlanChrome;

  if (showPlanDetailsChrome) {
    return (
      <header className="v2-header v2-header-pd">
        <button
          type="button"
          className="v2-header-back v2-header-back-chevron"
          aria-label={backLabel ? `Back to ${backLabel}` : 'Back'}
          onClick={onBack}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <h1 className="v2-header-pd-title">{centerTitle || 'Plan Details'}</h1>
        {typeof onShare === 'function' ? (
          <button
            type="button"
            className="v2-header-pd-share"
            aria-label="Share"
            onClick={onShare}
          >
            <IconShare width={18} height={18} aria-hidden="true" />
          </button>
        ) : (
          <div className="v2-header-spacer" aria-hidden="true" />
        )}
        {shareStatus ? (
          <span className="v2-visually-hidden" role="status">
            {shareStatus}
          </span>
        ) : null}
      </header>
    );
  }

  return (
    <header
      className={
        isFilmDetail
          ? 'v2-header v2-header-film'
          : showBuildPlanChrome
            ? 'v2-header v2-header-bp'
            : 'v2-header'
      }
    >
      {showBack ? (
        <button
          type="button"
          className={
            chevronOnly
              ? 'v2-header-back v2-header-back-chevron'
              : 'v2-header-back'
          }
          aria-label={
            backLabel ? `Back to ${backLabel}` : 'Back'
          }
          onClick={onBack}
        >
          <span aria-hidden="true">‹</span>
          {chevronOnly ? null : ` ${backLabel}`}
        </button>
      ) : (
        <div className="v2-header-spacer" aria-hidden="true" />
      )}
      <p className="v2-wordmark">
        <span className="v2-wordmark-line">REEL</span>
        <span className="v2-wordmark-line">SEATTLE</span>
      </p>
      {isFilmDetail ? (
        <div className="v2-header-spacer" aria-hidden="true" />
      ) : showSettings ? (
        <button
          type="button"
          className="v2-header-profile"
          aria-label="Settings (Stage 1 placeholder)"
          onClick={onSettingsClick}
        >
          <IconSettings />
        </button>
      ) : showBuildPlanChrome ? (
        typeof onShare === 'function' ? (
          <button
            type="button"
            className="v2-header-share"
            aria-label="Share"
            onClick={onShare}
          >
            <span>Share</span>
            <IconShare width={14} height={14} aria-hidden="true" />
          </button>
        ) : (
          <div className="v2-header-spacer" aria-hidden="true" />
        )
      ) : (
        <button
          type="button"
          className="v2-header-profile"
          aria-label="Open Profile"
          onClick={onProfileClick}
        >
          <IconProfile />
        </button>
      )}
      {isFilmDetail && shareStatus ? (
        <span className="v2-visually-hidden" role="status">
          {shareStatus}
        </span>
      ) : null}
    </header>
  );
}
