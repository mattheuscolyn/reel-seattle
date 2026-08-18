/**
 * Reusable Experience Detail surface (Open Caption mockup is the visual template).
 */

import { useMemo } from 'react';
import {
  IconCalendar,
  IconCaption,
  IconHeadphones,
  IconLink,
  IconMusic,
} from '../icons.jsx';
import BackButton from './BackButton.jsx';
import {
  AvailabilitySummary,
  DetailInfoCard,
  FeIcon,
  useInitialHeadingFocus,
} from './DetailParts.jsx';
import { composeExperienceDetail } from './composeFormatsExperiencesPresentation.js';

const HERO_ICONS = {
  caption: IconCaption,
  headphones: IconHeadphones,
  music: IconMusic,
};

/**
 * @param {{
 *   experienceId: string,
 *   homeData?: object | null,
 *   onBack: () => void,
 *   onBrowseShowtimes?: (payload: { formatKeys: string[] }) => void,
 *   onFeedback?: () => void,
 * }} props
 */
export default function ExperienceDetailSurface({
  experienceId,
  homeData = null,
  onBack,
  onBrowseShowtimes,
  onFeedback,
}) {
  const headingRef = useInitialHeadingFocus();
  const detail = useMemo(
    () => composeExperienceDetail(experienceId, homeData),
    [experienceId, homeData],
  );

  if (!detail) {
    return (
      <div className="v2-fe-page">
        <BackButton onClick={onBack} />
        <p role="status">Experience not found.</p>
      </div>
    );
  }

  const HeroIcon = HERO_ICONS[detail.icon] ?? IconCaption;

  return (
    <div
      className="v2-fe-page"
      data-fe-source="experience-detail"
      data-fe-experience-id={detail.id}
    >
      <BackButton onClick={onBack} />

      <header className="v2-fe-exp-hero">
        <span className="v2-fe-exp-hero-icon" aria-hidden="true">
          <HeroIcon width={44} height={44} />
        </span>
        <div className="v2-fe-exp-hero-copy">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="v2-fe-page-title"
          >
            {detail.name}
          </h1>
          <p className="v2-fe-page-tagline">{detail.shortDescription}</p>
        </div>
      </header>

      <DetailInfoCard title="What it is" icon="info">
        <p>{detail.whatItIs}</p>
      </DetailInfoCard>

      <DetailInfoCard title="Why choose it">
        <ul className="v2-fe-why-list" role="list">
          {detail.whyChooseIt.map((item) => (
            <li key={item.title} className="v2-fe-why-item">
              <span className="v2-fe-why-icon">
                <FeIcon name={item.icon} size={22} />
              </span>
              <span className="v2-fe-why-copy">
                <span className="v2-fe-why-title">{item.title}</span>
                <span className="v2-fe-why-desc">{item.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </DetailInfoCard>

      <DetailInfoCard title="What to know" icon="info">
        <ul className="v2-fe-bullet-list v2-fe-bullet-info">
          {detail.whatToKnow.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </DetailInfoCard>

      <section className="v2-fe-find-section" aria-labelledby="fe-find-heading">
        <h2 id="fe-find-heading" className="v2-section-caps">
          Find it in Seattle
        </h2>
        <AvailabilitySummary
          label={detail.availableAtLabel}
          sublabel="Based on current showtimes in the active week window"
          onClick={() =>
            onBrowseShowtimes?.({ formatKeys: [detail.browseFormatKey] })
          }
        />
        <button
          type="button"
          className="v2-fe-cta-outline"
          onClick={() =>
            onBrowseShowtimes?.({ formatKeys: [detail.browseFormatKey] })
          }
        >
          <IconCalendar width={18} height={18} aria-hidden="true" />
          {detail.showtimesCta}
        </button>
      </section>

      <p className="v2-fe-feedback">
        Have a question or feedback?{' '}
        <button
          type="button"
          className="v2-fe-feedback-link"
          onClick={onFeedback}
        >
          Let us know
          <IconLink width={12} height={12} aria-hidden="true" />
        </button>
      </p>
    </div>
  );
}
