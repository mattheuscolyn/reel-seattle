/**
 * Compact outline icons for the Home mockup chrome.
 * Stroke-based SVGs only — no emoji, no icon pack dependency.
 */

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

export function IconHome(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V21h13V9.5" />
    </svg>
  );
}

export function IconMovies(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M8 5v14M16 5v14M3.5 9.5h17M3.5 14.5h17" />
    </svg>
  );
}

export function IconTheaters(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20V8.5L12 4l8 4.5V20" />
      <path d="M9 20v-6h6v6" />
      <path d="M4 11h16" />
    </svg>
  );
}

export function IconPlanner(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
    </svg>
  );
}

export function IconMe(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="9" r="3.25" />
      <path d="M5.5 19.5c1.6-3.2 4-4.75 6.5-4.75s4.9 1.55 6.5 4.75" />
    </svg>
  );
}

export function IconProfile(props) {
  return (
    <svg {...base} width={20} height={20} {...props}>
      <circle cx="12" cy="9" r="3.25" />
      <path d="M5.5 19.5c1.6-3.2 4-4.75 6.5-4.75s4.9 1.55 6.5 4.75" />
    </svg>
  );
}

export function IconInfo(props) {
  return (
    <svg {...base} width={14} height={14} strokeWidth={1.7} {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 10.5V16M12 7.75h.01" />
    </svg>
  );
}

export function IconStar(props) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      {...props}
    >
      <path d="m12 3.4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.8 7.2 18.9l.9-5.4L4.2 9.1l5.4-.8z" />
    </svg>
  );
}

export function IconChevron(props) {
  return (
    <svg {...base} width={16} height={16} strokeWidth={1.8} {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function IconCalendar(props) {
  return (
    <svg {...base} width={20} height={20} {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
      <path d="M8 14h3M13 14h3" />
    </svg>
  );
}

export function IconFilm(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M8 5v14M16 5v14" />
    </svg>
  );
}

export function IconBuilding(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <path d="M4 20V7l8-3 8 3v13" />
      <path d="M9 20v-5h6v5" />
    </svg>
  );
}

export function IconSpark(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <path d="M12 3v4M12 17v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M3 12h4M17 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    </svg>
  );
}

export function IconCollection(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <rect x="4" y="5" width="12" height="14" rx="1.5" />
      <path d="M8 5V3.5h12V17.5H18" />
    </svg>
  );
}

export function IconSearch(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 3.5 3.5" />
    </svg>
  );
}

export function IconBookmark(props) {
  return (
    <svg {...base} width={20} height={20} {...props}>
      <path d="M7 4.5h10v15l-5-3.2L7 19.5z" />
    </svg>
  );
}

export function IconShare(props) {
  return (
    <svg {...base} width={20} height={20} {...props}>
      <path d="M12 3.5v10" />
      <path d="m8.5 7 3.5-3.5L15.5 7" />
      <path d="M6 12.5v5.5h12v-5.5" />
    </svg>
  );
}

export function IconEye(props) {
  return (
    <svg {...base} width={20} height={20} {...props}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function IconEyeOff(props) {
  return (
    <svg {...base} width={20} height={20} {...props}>
      <path d="M3 4.5 20 20" />
      <path d="M9.5 9.7A3 3 0 0 0 14.3 14" />
      <path d="M6.2 6.8C4 8.3 2.5 12 2.5 12s3.5 6 9.5 6c1.7 0 3.2-.4 4.5-1" />
      <path d="M14.5 8.2C13.8 7.7 13 7.4 12 7.4c-6 0-9.5 6-9.5 6" />
    </svg>
  );
}

export function IconCalendarPlus(props) {
  return (
    <svg {...base} width={20} height={20} {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17M12 13.5v5M9.5 16h5" />
    </svg>
  );
}

export function IconPin(props) {
  return (
    <svg {...base} width={14} height={14} {...props}>
      <path d="M12 21s-6.5-5.2-6.5-10a6.5 6.5 0 1 1 13 0c0 4.8-6.5 10-6.5 10z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

export function IconPerson(props) {
  return (
    <svg {...base} width={14} height={14} {...props}>
      <circle cx="12" cy="9" r="3" />
      <path d="M5.5 19c1.5-3 3.8-4.5 6.5-4.5s5 1.5 6.5 4.5" />
    </svg>
  );
}

export function IconHeart(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <path d="M12 19.2 5.4 13C3.2 10.9 3.4 7.5 5.9 5.7c1.9-1.4 4.4-.9 5.6 1 1.2-1.9 3.7-2.4 5.6-1 2.5 1.8 2.7 5.2.5 7.3z" />
    </svg>
  );
}

export function IconSettings(props) {
  return (
    <svg {...base} width={20} height={20} {...props}>
      <path d="M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z" />
      <path d="M10.1 3.4h3.8l.5 2.1 2-.8 1.9 1.9-.8 2 2.1.5v3.8l-2.1.5.8 2-1.9 1.9-2-.8-.5 2.1h-3.8l-.5-2.1-2 .8-1.9-1.9.8-2-2.1-.5V9.1l2.1-.5-.8-2 1.9-1.9 2 .8z" />
    </svg>
  );
}

export function IconBell(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <path d="M6.5 17.5h11" />
      <path d="M12 3.5a5 5 0 0 1 5 5v3.2l1.4 2.8H5.6L7 11.7V8.5a5 5 0 0 1 5-5z" />
    </svg>
  );
}

export function IconSun(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3.5v2M12 18.5v2M4.5 12h2M17.5 12h2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M6.2 17.8l1.4-1.4M16.4 7.6l1.4-1.4" />
    </svg>
  );
}

export function IconLock(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconShield(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <path d="M12 3.5 19 6.5v5c0 4.2-2.8 7.4-7 8.8-4.2-1.4-7-4.6-7-8.8v-5z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconLink(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <path d="M9.5 14.5 7.8 16.2a3.2 3.2 0 0 1-4.5-4.5l2.4-2.4a3.2 3.2 0 0 1 4.5 0" />
      <path d="M14.5 9.5 16.2 7.8a3.2 3.2 0 0 0-4.5-4.5L9.3 5.7a3.2 3.2 0 0 0 0 4.5" />
      <path d="m10 14 4-4" />
    </svg>
  );
}

export function IconStarFill(props) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
      focusable={false}
      {...props}
    >
      <path d="m12 3.4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.8 7.2 18.9l.9-5.4L4.2 9.1l5.4-.8z" />
    </svg>
  );
}

export function IconPlus(props) {
  return (
    <svg {...base} width={20} height={20} {...props}>
      <path d="M12 6v12M6 12h12" />
    </svg>
  );
}

export function IconMore(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <circle cx="6" cy="12" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.35" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconClapper(props) {
  return (
    <svg {...base} width={22} height={22} {...props}>
      <path d="M4 9.5h16v10.5H4z" />
      <path d="M4 9.5 7.2 4h12.3L16.3 9.5" />
      <path d="m7.5 4 2.2 5.5M11.5 4l2.2 5.5M15.5 4l2.2 5.5" />
    </svg>
  );
}

const EXPLORE_ICONS = {
  film: IconFilm,
  building: IconBuilding,
  spark: IconSpark,
  collection: IconCollection,
  search: IconSearch,
};

export function ExploreRowIcon({ name }) {
  const Cmp = EXPLORE_ICONS[name] ?? IconFilm;
  return <Cmp />;
}

export function IconExplore(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 3.5 3.5" />
    </svg>
  );
}

export function IconCheckCircle(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="m8.5 12.2 2.2 2.2 4.8-4.8" />
    </svg>
  );
}

export function IconCalendarStar(props) {
  return (
    <svg {...base} width={36} height={36} {...props}>
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M8 4.5v3M16 4.5v3M4 10h16" />
      <path d="m18.5 16.2 1.1 2.2 2.4.4-1.7 1.7.4 2.4-2.2-1.1-2.2 1.1.4-2.4-1.7-1.7 2.4-.4z" />
    </svg>
  );
}

export function IconTicket(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <path d="M4 8.5V6.2A1.7 1.7 0 0 1 5.7 4.5h12.6A1.7 1.7 0 0 1 20 6.2v2.3a1.7 1.7 0 0 0 0 3.4v2.3a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 14.2v-2.3a1.7 1.7 0 0 0 0-3.4z" />
      <path d="M13 7.5v1.2M13 11.5v1.2" />
    </svg>
  );
}

export function IconPalette(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <path d="M12 4.5a7.5 7.5 0 1 0 0 15h1.8a2.2 2.2 0 0 0 0-4.4H12" />
      <circle cx="8.2" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.8" r="1" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="8.2" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.2" cy="10.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconTrash(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M5 8v9h10V8" />
      <path d="M4 5.5h12M9 3.5h2M10 8v7M8 8v7M12 8v7" />
    </svg>
  );
}

export function IconPeople(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <circle cx="9" cy="9" r="2.4" />
      <path d="M4.5 17c1.1-2.2 2.8-3.3 4.5-3.3" />
      <circle cx="15.5" cy="9.2" r="2.1" />
      <path d="M15.5 13.7c1.6 0 3.2 1 4.2 3.3" />
    </svg>
  );
}

export function IconQuestion(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M9.8 9.2a2.3 2.3 0 1 1 3.5 2c-.8.5-1.3 1-1.3 2" />
      <path d="M12 16.2h.01" />
    </svg>
  );
}

export function IconCup(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M6 8h8v5.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8z" />
      <path d="M14 9.5h1.8a1.8 1.8 0 0 1 0 3.6H14" />
      <path d="M8 5.5c.4-.8.4-1.6 0-2.4M10.5 5.5c.4-.8.4-1.6 0-2.4" />
    </svg>
  );
}

export function IconEdit(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M4.5 16.5 6 12l8.5-8.5 2.5 2.5L8.5 16.5z" />
      <path d="m12.8 5.2 2.5 2.5" />
    </svg>
  );
}

export function IconChart(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M5 17V10M10 17V7M15 17v-5M19 17H4" />
    </svg>
  );
}

export function IconMultiPlan(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="8" r="2" />
      <circle cx="14" cy="17" r="2" />
      <path d="M7.8 11.2 16.2 8.8M7.5 13.5 12.4 16" />
    </svg>
  );
}

export function IconSliders(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <path d="M5 6h14M5 12h14M5 18h14" />
      <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="18" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconClock(props) {
  return (
    <svg {...base} width={14} height={14} {...props}>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 8.5v4l2.5 1.5" />
    </svg>
  );
}

export function IconBriefcase(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <rect x="4" y="8" width="16" height="11" rx="1.5" />
      <path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8" />
      <path d="M4 13h16" />
    </svg>
  );
}

export function IconPopcorn(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <path d="M7 10h10l-1.2 9H8.2L7 10Z" />
      <path d="M8 10c0-2 .8-4 2-4s1.5 1.5 2 3c.4-1.8 1.2-3 2.2-3 1.2 0 2 1.8 2 3.5" />
    </svg>
  );
}

export function IconMoon(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M15 13.5A7.5 7.5 0 0 1 8.5 3a6.2 6.2 0 1 0 6.5 10.5Z" />
    </svg>
  );
}

export function IconGlobe(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.5 2.5 11.5 0 16M12 4c-2.5 2.5-2.5 11.5 0 16" />
    </svg>
  );
}

export function IconWalk(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <circle cx="13" cy="5" r="2" />
      <path d="M10 22l2-6 3 2 2 6M9 12l3 2 2-4 3 1" />
    </svg>
  );
}

export function IconWallet(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconAccessibility(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <circle cx="12" cy="5" r="2" />
      <path d="M7 10h10M12 8v6M8 22l4-8 4 8" />
    </svg>
  );
}

export function IconParty(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M8 14l-3 7h14l-3-7H8Z" />
      <path d="M10 6l1 3M14 5l.5 3M17 8l-1 2" />
    </svg>
  );
}

export function IconBan(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M6.5 6.5l11 11" />
    </svg>
  );
}

export function IconClose(props) {
  return (
    <svg {...base} width={14} height={14} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconLayers(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <path d="M12 4l8 4-8 4-8-4 8-4Z" />
      <path d="M4 14l8 4 8-4M4 18l8 4 8-4" />
    </svg>
  );
}

export function IconHourglass(props) {
  return (
    <svg {...base} width={14} height={14} {...props}>
      <path d="M7 4h10M7 20h10M8 4c0 4 3 5 4 8-1 3-4 4-4 8M16 4c0 4-3 5-4 8 1 3 4 4 4 8" />
    </svg>
  );
}

export function IconRefresh(props) {
  return (
    <svg {...base} width={14} height={14} {...props}>
      <path d="M19 12a7 7 0 1 1-2-4.9" />
      <path d="M19 4v5h-5" />
    </svg>
  );
}

export function IconTarget(props) {
  return (
    <svg {...base} width={16} height={16} {...props}>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

const NAV_ICONS = {
  home: IconHome,
  explore: IconExplore,
  planner: IconPlanner,
  profile: IconProfile,
};

export function NavDestinationIcon({ id }) {
  const Cmp = NAV_ICONS[id] ?? IconHome;
  return <Cmp />;
}
