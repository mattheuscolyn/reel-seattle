import {
  IconBookmark,
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
 * - film detail: ← Origin · wordmark · Save (local store) · Share
 */
export default function AppHeader({
  onProfileClick,
  onSettingsClick = null,
  headerMode = 'default',
  backLabel = null,
  onBack = null,
  variant = 'default',
  shareTitle = null,
  onShare = null,
  shareStatus = null,
  onSave = null,
  savePressed = false,
  saveAvailable = true,
  saveLabel = 'Save',
}) {
  const showFilmActions = variant === 'film-detail';
  const showSettings =
    headerMode === 'profile' && typeof onSettingsClick === 'function';

  return (
    <header
      className={showFilmActions ? 'v2-header v2-header-film' : 'v2-header'}
    >
      {backLabel && onBack ? (
        <button
          type="button"
          className="v2-header-back"
          aria-label={`Back to ${backLabel}`}
          onClick={onBack}
        >
          ← {backLabel}
        </button>
      ) : (
        <div className="v2-header-spacer" aria-hidden="true" />
      )}
      <p className="v2-wordmark">
        <span className="v2-wordmark-line">REEL</span>
        <span className="v2-wordmark-line">SEATTLE</span>
      </p>
      {showFilmActions ? (
        <div className="v2-header-film-actions">
          <button
            type="button"
            className={
              savePressed
                ? 'v2-header-icon-btn v2-header-icon-btn-save-on'
                : 'v2-header-icon-btn'
            }
            aria-label={saveLabel}
            aria-pressed={savePressed}
            disabled={!saveAvailable}
            onClick={onSave ?? undefined}
          >
            <IconBookmark />
          </button>
          <button
            type="button"
            className="v2-header-icon-btn"
            aria-label={shareTitle ? `Share ${shareTitle}` : 'Share film'}
            onClick={onShare}
          >
            <IconShare />
          </button>
          {shareStatus ? (
            <span className="v2-visually-hidden" role="status">
              {shareStatus}
            </span>
          ) : null}
        </div>
      ) : showSettings ? (
        <button
          type="button"
          className="v2-header-profile"
          aria-label="Settings (Stage 1 placeholder)"
          onClick={onSettingsClick}
        >
          <IconSettings />
        </button>
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
    </header>
  );
}
