/**
 * Application chrome frame: sticky header, main column, primary nav.
 */

export default function AppShell({
  filmDetail = false,
  notificationsOpen = false,
  header,
  nav = null,
  overlay = null,
  children,
}) {
  const className = [
    filmDetail ? 'v2-shell v2-shell-fd' : 'v2-shell',
    notificationsOpen ? 'v2-shell-with-notifications' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className}>
      <span className="v2-visually-hidden">Local only</span>
      <div inert={notificationsOpen || undefined}>
        {header}
        <main className="v2-main" id="v2-main">
          {children}
        </main>
        {nav}
      </div>
      {overlay}
    </div>
  );
}
