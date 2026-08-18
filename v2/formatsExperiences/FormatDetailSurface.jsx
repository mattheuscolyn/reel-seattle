/**
 * Reusable Format Detail surface (IMAX mockup is the visual template).
 */

import { useMemo } from 'react';
import {
  IconChevron,
  IconFilm,
  IconPin,
  IconTicket,
} from '../icons.jsx';
import BackButton from './BackButton.jsx';
import { FormatTile } from './FormatTile.jsx';
import {
  AtAGlanceGrid,
  DetailInfoCard,
  useInitialHeadingFocus,
} from './DetailParts.jsx';
import { composeFormatDetail } from './composeFormatsExperiencesPresentation.js';

/**
 * @param {{
 *   formatId: string,
 *   homeData?: object | null,
 *   onBack: () => void,
 *   onCompareFormats?: () => void,
 *   onBrowseShowtimes?: (payload: { formatKeys: string[] }) => void,
 * }} props
 */
export default function FormatDetailSurface({
  formatId,
  homeData = null,
  onBack,
  onCompareFormats,
  onBrowseShowtimes,
}) {
  const headingRef = useInitialHeadingFocus();
  const detail = useMemo(
    () => composeFormatDetail(formatId, homeData),
    [formatId, homeData],
  );

  if (!detail) {
    return (
      <div className="v2-fe-page">
        <BackButton onClick={onBack} />
        <p role="status">Format not found.</p>
      </div>
    );
  }

  return (
    <div
      className="v2-fe-page"
      data-fe-source="format-detail"
      data-fe-format-id={detail.id}
    >
      <BackButton onClick={onBack} />

      <header className="v2-fe-detail-hero">
        <FormatTile
          tone={detail.tileTone}
          label={detail.tileLabel}
          size="lg"
        />
        <div className="v2-fe-detail-hero-copy">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="v2-fe-page-title"
          >
            {detail.name}
          </h1>
          <p className="v2-fe-page-tagline">{detail.shortDescription}</p>
          <div className="v2-fe-detail-meta">
            <span>
              <IconFilm width={14} height={14} aria-hidden="true" />
              Format guide
            </span>
            <span className="v2-fe-detail-meta-div" aria-hidden="true" />
            <span>
              <IconPin width={14} height={14} aria-hidden="true" />
              {detail.availableAtLabel}
            </span>
          </div>
        </div>
      </header>

      <AtAGlanceGrid items={detail.atAGlance} />

      <DetailInfoCard title="What it is" icon="info">
        <p>{detail.whatItIs}</p>
      </DetailInfoCard>

      <DetailInfoCard title="Why choose it" icon="check">
        <ul className="v2-fe-bullet-list v2-fe-bullet-check">
          {detail.whyChooseIt.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </DetailInfoCard>

      <DetailInfoCard title="Good to know" icon="info">
        <ul className="v2-fe-bullet-list v2-fe-bullet-info">
          {detail.goodToKnow.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </DetailInfoCard>

      <div className="v2-fe-detail-actions">
        <button
          type="button"
          className="v2-fe-cta-primary"
          onClick={() =>
            onBrowseShowtimes?.({ formatKeys: [detail.browseFormatKey] })
          }
        >
          <IconTicket width={18} height={18} aria-hidden="true" />
          <span>{detail.showtimesCta}</span>
          <IconChevron width={16} height={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="v2-fe-cta-secondary"
          onClick={onCompareFormats}
        >
          Compare formats
          <IconChevron width={16} height={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
