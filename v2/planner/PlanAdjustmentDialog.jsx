/**
 * Shared Results adjustment dialog chrome (backdrop + panel + close).
 */

import { useId, useRef } from 'react';
import { IconClose } from '../icons.jsx';
import { usePlanAdjustmentDialog } from './usePlanAdjustmentDialog.js';

/**
 * @param {{
 *   title: string,
 *   support?: string | null,
 *   subtitle?: string | null,
 *   icon?: import('react').ReactNode,
 *   headerLayout?: 'inline' | 'centered',
 *   onCancel: () => void,
 *   children: import('react').ReactNode,
 *   footer: import('react').ReactNode,
 *   footerClassName?: string,
 *   'data-adjustment'?: string,
 * }} props
 */
export default function PlanAdjustmentDialog({
  title,
  support = null,
  subtitle = null,
  icon = null,
  headerLayout = 'inline',
  onCancel,
  children,
  footer,
  footerClassName = '',
  'data-adjustment': dataAdjustment,
}) {
  const titleId = useId();
  const closeRef = useRef(null);
  const { dialogRef } = usePlanAdjustmentDialog({
    open: true,
    onCancel,
    initialFocusRef: closeRef,
  });

  const centered = headerLayout === 'centered' && icon;

  return (
    <div
      className="v2-bpr-adj-backdrop"
      role="presentation"
      data-bpr-adjustment={dataAdjustment ?? 'open'}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className={`v2-bpr-adj-dialog${centered ? ' is-centered-head' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          ref={closeRef}
          type="button"
          className="v2-bpr-adj-close"
          aria-label="Close"
          onClick={onCancel}
        >
          <IconClose width={12} height={12} />
        </button>

        {centered ? (
          <div className="v2-bpr-adj-head v2-bpr-adj-head-centered">
            <span className="v2-bpr-adj-icon v2-bpr-adj-icon-lg" aria-hidden="true">
              {icon}
            </span>
            <h2 id={titleId} className="v2-bpr-adj-title">
              {title}
            </h2>
            {subtitle ? (
              <p className="v2-bpr-adj-film-title">{subtitle}</p>
            ) : null}
            {support ? <p className="v2-bpr-adj-support">{support}</p> : null}
          </div>
        ) : (
          <div className={`v2-bpr-adj-head${icon ? '' : ' no-icon'}`}>
            {icon ? (
              <span className="v2-bpr-adj-icon" aria-hidden="true">
                {icon}
              </span>
            ) : null}
            <div className="v2-bpr-adj-head-copy">
              <h2 id={titleId} className="v2-bpr-adj-title">
                {title}
              </h2>
              {support ? <p className="v2-bpr-adj-support">{support}</p> : null}
            </div>
          </div>
        )}

        <div className="v2-bpr-adj-body">{children}</div>
        <div
          className={`v2-bpr-adj-footer${footerClassName ? ` ${footerClassName}` : ''}`}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}
