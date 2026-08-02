/**
 * Stage 1 About My Schedule — fixture-backed replica of About My Schedule Page.png.
 *
 * Static help content only. Link/FAQ controls are Stage 1 stubs.
 * T-CAL-02 / D09: calendar card describes one-time .ics export (no sync claims).
 */

import { useId, useState } from 'react';
import {
  IconBookmark,
  IconCalendar,
  IconCalendarPlus,
  IconCalendarStar,
  IconChart,
  IconCheckCircle,
  IconChevron,
  IconCup,
  IconEdit,
  IconLock,
  IconMultiPlan,
  IconPalette,
  IconPeople,
  IconPlus,
  IconQuestion,
  IconSearch,
  IconShield,
  IconTicket,
  IconTrash,
} from '../icons.jsx';
import { resolveAboutMySchedulePresentation } from '../fixtures/aboutMyScheduleMockupFixture.js';

const BULLET_ICONS = {
  calendarCheck: IconCalendar,
  search: IconSearch,
  edit: IconEdit,
  chart: IconChart,
  palette: IconPalette,
  calendar: IconCalendar,
};

const PLAN_TYPE_ICONS = {
  bookmark: IconBookmark,
  multi: IconMultiPlan,
  cup: IconCup,
  calendarImport: IconCalendarPlus,
};

const FLOW_ICONS = {
  bookmark: IconBookmark,
  ticket: IconTicket,
  calendar: IconCalendar,
};

const FEATURE_ICONS = {
  palette: IconPalette,
  calendarSync: IconCalendar,
  ticket: IconTicket,
};

const PRIVACY_ICONS = {
  lock: IconLock,
  people: IconPeople,
  trash: IconTrash,
};

function AboutScheduleSection({ sectionKey, title, headingId, children }) {
  return (
    <section
      className="v2-about-section"
      data-about-section={sectionKey}
      aria-labelledby={headingId}
    >
      {title ? (
        <h2 id={headingId} className="v2-about-section-title">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

function WeekPreview() {
  return (
    <div className="v2-about-week-preview" aria-hidden="true">
      <div className="v2-about-week-times">
        <span>12 PM</span>
        <span>3 PM</span>
        <span>6 PM</span>
        <span>9 PM</span>
      </div>
      <div className="v2-about-week-row">
        <span className="v2-about-week-day">
          FRI
          <br />
          JUL 18
        </span>
        <div className="v2-about-week-track">
          <span className="v2-about-week-block v2-about-week-purple" />
          <span className="v2-about-week-block v2-about-week-teal" />
        </div>
      </div>
      <div className="v2-about-week-row">
        <span className="v2-about-week-day">
          SAT
          <br />
          JUL 19
        </span>
        <div className="v2-about-week-track">
          <span className="v2-about-week-block v2-about-week-blue" />
          <span className="v2-about-week-block v2-about-week-amber" />
        </div>
      </div>
      <div className="v2-about-week-row">
        <span className="v2-about-week-day">
          SUN
          <br />
          JUL 20
        </span>
        <div className="v2-about-week-track">
          <span className="v2-about-week-add">
            <IconPlus width={14} height={14} />
          </span>
        </div>
      </div>
    </div>
  );
}

function MonthPreview({ legend }) {
  const cells = [
    0, 0, 1, 0, 2, 0, 0, 3, 0, 1, 4, 0, 2, 0, 0, 1, 0, 3, 0, 0, 2, 0, 1, 0, 0,
    0, 0, 0,
  ];
  return (
    <div className="v2-about-month-preview" aria-hidden="true">
      <div className="v2-about-month-dow">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>
      <div className="v2-about-month-grid">
        {cells.map((level, i) => (
          <span
            key={i}
            className={`v2-about-month-cell v2-about-month-l${level}`}
          >
            {level > 0 ? '·'.repeat(Math.min(level, 4)) : ''}
          </span>
        ))}
      </div>
      <div className="v2-about-month-legend">
        {legend.map((item) => (
          <span key={item.label} className="v2-about-month-legend-item">
            <span
              className={`v2-about-month-swatch v2-about-month-l${item.level}`}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * @param {{
 *   onBack: () => void,
 *   onStubAction?: (actionId: string, label: string) => void,
 * }} props
 */
export default function AboutMyScheduleSurface({ onBack, onStubAction }) {
  const presentation = resolveAboutMySchedulePresentation();
  const stubStatusId = useId();
  const [stubMessage, setStubMessage] = useState(null);

  const announceStub = (actionId, label) => {
    const message = `${label} isn’t available in this Stage 1 About shell yet.`;
    setStubMessage(message);
    onStubAction?.(actionId, label);
  };

  const {
    title,
    intro,
    whatItDoes,
    twoViews,
    whatCountsAsPlan,
    featureCards,
    privacy,
    faq,
  } = presentation;

  const accentBody = (text, phrase) => {
    if (!phrase || !text.includes(phrase)) return text;
    const [before, after] = text.split(phrase);
    return (
      <>
        {before}
        <span className="v2-about-accent">{phrase}</span>
        {after}
      </>
    );
  };

  return (
    <article
      className="v2-about"
      aria-labelledby="v2-about-title"
      data-about-source={presentation.source}
    >
      <header className="v2-about-header" data-about-section="header">
        <button
          type="button"
          className="v2-about-back"
          aria-label="Back"
          onClick={onBack}
        >
          <span aria-hidden="true">←</span>
        </button>
        <h1 id="v2-about-title" className="v2-about-title">
          {title}
        </h1>
        <p className="v2-about-intro">{intro}</p>
      </header>

      <AboutScheduleSection
        sectionKey="whatItDoes"
        title={whatItDoes.title}
        headingId="v2-about-what-h"
      >
        <div className="v2-about-what-card">
          <span className="v2-about-what-icon" aria-hidden="true">
            <IconCalendarStar />
          </span>
          <div className="v2-about-what-copy">
            <p className="v2-about-what-lead">
              {whatItDoes.leadBefore}
              <span className="v2-about-accent">{whatItDoes.leadAccent}</span>
            </p>
            <ul className="v2-about-check-list">
              {whatItDoes.bullets.map((item) => (
                <li key={item}>
                  <IconCheckCircle aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </AboutScheduleSection>

      <AboutScheduleSection
        sectionKey="twoViews"
        title={twoViews.title}
        headingId="v2-about-views-h"
      >
        <div className="v2-about-views-grid">
          <div className="v2-about-view-card">
            <h3 className="v2-about-view-title">{twoViews.week.title}</h3>
            <p className="v2-about-view-sub">{twoViews.week.subtitle}</p>
            <WeekPreview />
            <ul className="v2-about-icon-list">
              {twoViews.week.bullets.map((item) => {
                const Icon = BULLET_ICONS[item.icon] ?? IconCalendar;
                return (
                  <li key={item.text}>
                    <Icon aria-hidden="true" />
                    <span>{item.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="v2-about-view-card">
            <h3 className="v2-about-view-title">{twoViews.month.title}</h3>
            <p className="v2-about-view-sub">{twoViews.month.subtitle}</p>
            <MonthPreview legend={twoViews.month.legend} />
            <ul className="v2-about-icon-list">
              {twoViews.month.bullets.map((item) => {
                const Icon = BULLET_ICONS[item.icon] ?? IconCalendar;
                return (
                  <li key={item.text}>
                    <Icon aria-hidden="true" />
                    <span>{item.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </AboutScheduleSection>

      <AboutScheduleSection
        sectionKey="whatCountsAsPlan"
        title={whatCountsAsPlan.title}
        headingId="v2-about-plan-h"
      >
        {whatCountsAsPlan.body.map((paragraph) => (
          <p key={paragraph} className="v2-about-body">
            {accentBody(paragraph, whatCountsAsPlan.bodyAccentPhrase)}
          </p>
        ))}
        <ol className="v2-about-flow" aria-label="How a film becomes a plan">
          {whatCountsAsPlan.flow.map((step, index) => {
            const Icon = FLOW_ICONS[step.icon] ?? IconCalendar;
            return (
              <li key={step.id} className="v2-about-flow-step">
                {index > 0 ? (
                  <span className="v2-about-flow-arrow" aria-hidden="true">
                    →
                  </span>
                ) : null}
                <span className="v2-about-flow-icon" aria-hidden="true">
                  <Icon width={18} height={18} />
                </span>
                <span className="v2-about-flow-label">{step.label}</span>
              </li>
            );
          })}
        </ol>
        <p className="v2-about-plan-types-label">
          {whatCountsAsPlan.youCanPlanLabel}
        </p>
        <ul className="v2-about-plan-types">
          {whatCountsAsPlan.planTypes.map((type) => {
            const Icon = PLAN_TYPE_ICONS[type.icon] ?? IconBookmark;
            return (
              <li key={type.id}>
                <span className="v2-about-chip">
                  <Icon width={14} height={14} aria-hidden="true" />
                  {type.label}
                </span>
              </li>
            );
          })}
        </ul>
      </AboutScheduleSection>

      <section
        className="v2-about-section"
        data-about-section="featureCards"
        aria-label="Schedule details"
      >
        <div className="v2-about-feature-grid">
          {featureCards.cards.map((card) => {
            const Icon = FEATURE_ICONS[card.icon] ?? IconInfoFallback;
            return (
              <article key={card.id} className="v2-about-feature-card">
                <span className="v2-about-feature-icon" aria-hidden="true">
                  <Icon />
                </span>
                <h2 className="v2-about-feature-title">{card.title}</h2>
                <p className="v2-about-feature-summary">{card.summary}</p>
                <ul className="v2-about-check-list v2-about-check-list-compact">
                  {card.bullets.map((bullet) => (
                    <li key={bullet}>
                      <IconCheckCircle aria-hidden="true" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="v2-about-link"
                  onClick={() => announceStub(card.linkAction, card.linkLabel)}
                >
                  {card.linkLabel}
                  <span aria-hidden="true"> ›</span>
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section
        className="v2-about-section"
        data-about-section="privacy"
        aria-labelledby="v2-about-privacy-h"
      >
        <div className="v2-about-privacy-card">
          <div className="v2-about-privacy-head">
            <span className="v2-about-privacy-shield" aria-hidden="true">
              <IconShield width={28} height={28} />
            </span>
            <h2 id="v2-about-privacy-h" className="v2-about-privacy-title">
              {privacy.title}
            </h2>
          </div>
          <ul className="v2-about-privacy-points">
            {privacy.points.map((point) => {
              const Icon = PRIVACY_ICONS[point.icon] ?? IconLock;
              return (
                <li key={point.id}>
                  <Icon aria-hidden="true" />
                  <span>{point.text}</span>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="v2-about-link v2-about-link-end"
            onClick={() =>
              announceStub(privacy.linkAction, privacy.linkLabel)
            }
          >
            {privacy.linkLabel}
            <span aria-hidden="true"> ›</span>
          </button>
        </div>
      </section>

      <AboutScheduleSection
        sectionKey="faq"
        title={faq.title}
        headingId="v2-about-faq-h"
      >
        <ul className="v2-about-faq">
          {faq.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="v2-about-faq-row"
                onClick={() => announceStub(`faq-${item.id}`, item.question)}
              >
                <span className="v2-about-faq-icon" aria-hidden="true">
                  <IconQuestion />
                </span>
                <span className="v2-about-faq-q">{item.question}</span>
                <span aria-hidden="true">
                  <IconChevron />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </AboutScheduleSection>

      <p
        id={stubStatusId}
        className="v2-visually-hidden"
        role="status"
        aria-live="polite"
      >
        {stubMessage ?? ''}
      </p>
    </article>
  );
}

function IconInfoFallback(props) {
  return <IconPalette {...props} />;
}
