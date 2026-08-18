/**
 * Help Me Choose a Format — deterministic priority → recommendation guide.
 */

import { useMemo, useState } from 'react';
import {
  IconExpand,
  IconEye,
  IconFilm,
  IconScales,
  IconSpark,
  IconStar,
  IconTicket,
  IconLightbulb,
} from '../icons.jsx';
import BackButton from './BackButton.jsx';
import { useInitialHeadingFocus } from './DetailParts.jsx';
import { FormatTile } from './FormatTile.jsx';
import { composeFormatRecommendation } from './composeFormatsExperiencesPresentation.js';

const PRIORITY_ICONS = {
  expand: IconExpand,
  spark: IconSpark,
  film: IconFilm,
  eye: IconEye,
  ticket: IconTicket,
};

/**
 * @param {{
 *   homeData?: object | null,
 *   onBack: () => void,
 *   onCompareFormats?: () => void,
 *   onBrowseShowtimes?: (payload: { formatKeys?: string[] }) => void,
 *   onOpenFormatDetail?: (payload: { formatId: string }) => void,
 * }} props
 */
export default function FormatRecommendationSurface({
  homeData = null,
  onBack,
  onCompareFormats,
  onBrowseShowtimes,
  onOpenFormatDetail,
}) {
  const headingRef = useInitialHeadingFocus();
  const [priorityId, setPriorityId] = useState('picture-sound');
  const presentation = useMemo(
    () => composeFormatRecommendation(priorityId, homeData),
    [priorityId, homeData],
  );
  const { copy, priorities, bestMatch, alsoConsider, ruleOfThumb } =
    presentation;

  return (
    <div
      className="v2-fe-page"
      data-fe-source="format-recommendation"
      data-fe-priority={priorityId}
    >
      <BackButton onClick={onBack} />

      <header className="v2-fe-page-header">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="v2-fe-page-title"
        >
          {copy.title}
        </h1>
        <p className="v2-fe-page-tagline">{copy.subtitle}</p>
      </header>

      <section
        className="v2-fe-priority-section"
        aria-labelledby="fe-priority-heading"
      >
        <h2 id="fe-priority-heading" className="v2-section-caps">
          {copy.priorityHeading}
        </h2>
        <div
          className="v2-fe-priority-list"
          role="radiogroup"
          aria-labelledby="fe-priority-heading"
        >
          {priorities.map((priority) => {
            const selected = priority.id === priorityId;
            const IconCmp = PRIORITY_ICONS[priority.icon] ?? IconSpark;
            return (
              <button
                key={priority.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={
                  selected
                    ? 'v2-fe-priority-row v2-fe-priority-row-selected'
                    : 'v2-fe-priority-row'
                }
                onClick={() => setPriorityId(priority.id)}
              >
                <span className="v2-fe-priority-icon" aria-hidden="true">
                  <IconCmp width={18} height={18} />
                </span>
                <span className="v2-fe-priority-label">{priority.label}</span>
                <span
                  className={
                    selected
                      ? 'v2-fe-priority-radio v2-fe-priority-radio-on'
                      : 'v2-fe-priority-radio'
                  }
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </section>

      {bestMatch ? (
        <section
          className="v2-fe-match-section"
          aria-labelledby="fe-best-heading"
        >
          <h2 id="fe-best-heading" className="v2-section-caps">
            {copy.bestMatchHeading}
          </h2>
          <button
            type="button"
            className="v2-fe-best-card"
            onClick={() => onOpenFormatDetail?.({ formatId: bestMatch.id })}
          >
            <FormatTile
              tone={bestMatch.tileTone}
              label={bestMatch.tileLabel}
              size="lg"
            />
            <span className="v2-fe-best-copy">
              <span className="v2-fe-best-name">{bestMatch.name}</span>
              <span className="v2-fe-best-desc">
                {bestMatch.shortDescription}
              </span>
              <span className="v2-fe-best-blurb">
                <IconStar width={14} height={14} aria-hidden="true" />
                {bestMatch.blurb}
              </span>
              <span
                className={
                  bestMatch.availabilityLabel === 'No current showtimes'
                    ? 'v2-fe-match-availability v2-fe-match-availability-empty'
                    : 'v2-fe-match-availability'
                }
              >
                {bestMatch.availabilityLabel}
              </span>
            </span>
          </button>
        </section>
      ) : null}

      {alsoConsider.length > 0 ? (
        <section
          className="v2-fe-also-section"
          aria-labelledby="fe-also-heading"
        >
          <h2 id="fe-also-heading" className="v2-section-caps">
            {copy.alsoConsiderHeading}
          </h2>
          <ul className="v2-fe-also-list" role="list">
            {alsoConsider.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="v2-fe-also-card"
                  onClick={() =>
                    onOpenFormatDetail?.({ formatId: item.id })
                  }
                >
                  <FormatTile
                    tone={item.tileTone}
                    label={item.tileLabel}
                    size="md"
                  />
                  <span className="v2-fe-also-copy">
                    <span className="v2-fe-also-name">{item.name}</span>
                    <span className="v2-fe-also-desc">
                      {item.shortDescription}
                    </span>
                    <span
                      className={
                        item.availabilityLabel === 'No current showtimes'
                          ? 'v2-fe-match-availability v2-fe-match-availability-empty'
                          : 'v2-fe-match-availability'
                      }
                    >
                      {item.availabilityLabel}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <aside className="v2-fe-rule-card">
        <span className="v2-fe-rule-icon" aria-hidden="true">
          <IconLightbulb width={18} height={18} />
        </span>
        <span className="v2-fe-rule-copy">
          <strong>Quick rule of thumb</strong>
          <span>{ruleOfThumb}</span>
        </span>
      </aside>

      <div className="v2-fe-detail-actions">
        <button
          type="button"
          className="v2-fe-cta-outline"
          onClick={onCompareFormats}
        >
          <IconScales width={18} height={18} aria-hidden="true" />
          {copy.compareCta}
        </button>
        <button
          type="button"
          className="v2-fe-cta-primary"
          onClick={() =>
            onBrowseShowtimes?.({
              formatKeys: bestMatch
                ? [bestMatch.browseFormatKey]
                : undefined,
            })
          }
        >
          <IconTicket width={18} height={18} aria-hidden="true" />
          {copy.browseCta}
        </button>
      </div>
    </div>
  );
}
