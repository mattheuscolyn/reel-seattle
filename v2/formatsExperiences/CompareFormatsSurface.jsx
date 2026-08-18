/**
 * Compare Formats — horizontally scrollable attribute table.
 * Facts from Markdown source of truth; layout from mockup.
 */

import { useMemo } from 'react';
import {
  IconChevron,
  IconLightbulb,
  IconQuestion,
  IconScales,
} from '../icons.jsx';
import BackButton from './BackButton.jsx';
import { useInitialHeadingFocus } from './DetailParts.jsx';
import { FormatTile } from './FormatTile.jsx';
import { composeCompareFormats } from './composeFormatsExperiencesPresentation.js';

/**
 * @param {{
 *   homeData?: object | null,
 *   onBack: () => void,
 *   onHelpMeChoose?: () => void,
 *   onOpenFormatDetail?: (payload: { formatId: string }) => void,
 * }} props
 */
export default function CompareFormatsSurface({
  homeData = null,
  onBack,
  onHelpMeChoose,
  onOpenFormatDetail,
}) {
  const headingRef = useInitialHeadingFocus();
  const presentation = useMemo(
    () => composeCompareFormats(homeData),
    [homeData],
  );
  const { intro, attributes, columns } = presentation;

  return (
    <div
      className="v2-fe-page"
      data-fe-source="compare-formats"
    >
      <BackButton onClick={onBack} />

      <header className="v2-fe-page-header">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="v2-fe-page-title"
        >
          {intro.title}
        </h1>
        <p className="v2-fe-page-tagline">{intro.description}</p>
      </header>

      <aside className="v2-fe-proviso" aria-label="Comparison guidance">
        <span className="v2-fe-proviso-icon" aria-hidden="true">
          <IconScales width={18} height={18} />
        </span>
        <div>
          <p className="v2-fe-proviso-title">{intro.provisoTitle}</p>
          <p className="v2-fe-proviso-body">{intro.provisoBody}</p>
        </div>
      </aside>

      <div
        className="v2-fe-compare-scroll"
        tabIndex={0}
        role="region"
        aria-label="Format comparison table; scroll horizontally for all formats"
      >
        <table className="v2-fe-compare-table">
          <caption className="v2-sr-only">
            Side-by-side comparison of Seattle cinema formats. Not a ranking.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="v2-fe-compare-sticky">
                <span className="v2-section-caps">Format</span>
              </th>
              {columns.map((col) => (
                <th key={col.id} scope="col">
                  <button
                    type="button"
                    className="v2-fe-compare-col-btn"
                    onClick={() =>
                      onOpenFormatDetail?.({ formatId: col.id })
                    }
                  >
                    <FormatTile
                      tone={col.tileTone}
                      label={col.tileLabel}
                      size="md"
                    />
                    <span>{col.name}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attributes.map((attr) => (
              <tr key={attr.id}>
                <th scope="row" className="v2-fe-compare-sticky">
                  <span className="v2-section-caps">{attr.label}</span>
                </th>
                {columns.map((col) => {
                  const value = col.cells[attr.id] ?? '—';
                  if (attr.id === 'availability') {
                    return (
                      <td key={col.id}>
                        {col.hasCurrentShowtimes ? (
                          <button
                            type="button"
                            className="v2-fe-compare-avail-link"
                            onClick={() =>
                              onOpenFormatDetail?.({ formatId: col.id })
                            }
                          >
                            {value}
                          </button>
                        ) : (
                          <span>{value}</span>
                        )}
                      </td>
                    );
                  }
                  return <td key={col.id}>{value}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <aside className="v2-fe-note-card" aria-label="Availability note">
        <span className="v2-fe-note-icon" aria-hidden="true">
          <IconLightbulb width={18} height={18} />
        </span>
        <p className="v2-fe-note-copy">{intro.availabilityNote}</p>
      </aside>

      <section className="v2-fe-help-entry" aria-labelledby="fe-help-label">
        <h2 id="fe-help-label" className="v2-section-caps">
          {intro.helpLabel}
        </h2>
        <button
          type="button"
          className="v2-fe-help-card"
          onClick={onHelpMeChoose}
        >
          <span className="v2-fe-help-icon" aria-hidden="true">
            <IconQuestion width={20} height={20} />
          </span>
          <span className="v2-fe-help-copy">
            <span className="v2-fe-help-title">{intro.helpTitle}</span>
            <span className="v2-fe-help-body">{intro.helpBody}</span>
          </span>
          <IconChevron width={16} height={16} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}
