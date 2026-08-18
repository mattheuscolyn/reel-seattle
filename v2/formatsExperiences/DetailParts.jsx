/**
 * Shared Formats & Experiences detail building blocks.
 */

import { useEffect, useRef } from 'react';
import {
  IconAspect,
  IconCaption,
  IconCheck,
  IconExpand,
  IconEye,
  IconFilm,
  IconHeadphones,
  IconInfo,
  IconMusic,
  IconPeople,
  IconPin,
  IconSpark,
  IconTicket,
  IconVolume,
} from '../icons.jsx';

const ICON_MAP = {
  projector: IconFilm,
  spark: IconSpark,
  aspect: IconAspect,
  sound: IconVolume,
  expand: IconExpand,
  film: IconFilm,
  info: IconInfo,
  eye: IconEye,
  caption: IconCaption,
  people: IconPeople,
  check: IconCheck,
  headphones: IconHeadphones,
  music: IconMusic,
  ticket: IconTicket,
  pin: IconPin,
};

export function useInitialHeadingFocus() {
  const headingRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return headingRef;
}

/**
 * @param {{ name?: string, size?: number }} props
 */
export function FeIcon({ name, size = 16 }) {
  const Cmp = ICON_MAP[name] ?? IconInfo;
  return <Cmp width={size} height={size} aria-hidden="true" />;
}

/**
 * @param {{ title: string, children: import('react').ReactNode, icon?: string }} props
 */
export function DetailInfoCard({ title, children, icon }) {
  return (
    <section className="v2-fe-info-card">
      <h2 className="v2-fe-info-card-title">
        {icon ? <FeIcon name={icon} size={16} /> : null}
        {title}
      </h2>
      <div className="v2-fe-info-card-body">{children}</div>
    </section>
  );
}

/**
 * @param {{ items: { id: string, label: string, value: string, icon?: string }[] }} props
 */
export function AtAGlanceGrid({ items }) {
  return (
    <section className="v2-fe-glance" aria-labelledby="fe-glance-heading">
      <h2 id="fe-glance-heading" className="v2-section-caps">
        At a glance
      </h2>
      <ul className="v2-fe-glance-grid" role="list">
        {items.map((item) => (
          <li key={item.id} className="v2-fe-glance-card">
            <span className="v2-fe-glance-icon">
              <FeIcon name={item.icon} size={20} />
            </span>
            <span className="v2-fe-glance-label">{item.label}</span>
            <span className="v2-fe-glance-value">{item.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * @param {{
 *   label: string,
 *   sublabel?: string | null,
 *   onClick?: () => void,
 * }} props
 */
export function AvailabilitySummary({ label, sublabel, onClick }) {
  const interactive = typeof onClick === 'function';
  const className = interactive
    ? 'v2-fe-availability v2-fe-availability-btn'
    : 'v2-fe-availability';
  const inner = (
    <>
      <span className="v2-fe-availability-icon">
        <IconPin width={20} height={20} aria-hidden="true" />
      </span>
      <span className="v2-fe-availability-copy">
        <span className="v2-fe-availability-label">{label}</span>
        {sublabel ? (
          <span className="v2-fe-availability-sub">{sublabel}</span>
        ) : null}
      </span>
      {interactive ? (
        <span className="v2-fe-availability-chevron" aria-hidden="true">
          ›
        </span>
      ) : null}
    </>
  );
  if (interactive) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}
