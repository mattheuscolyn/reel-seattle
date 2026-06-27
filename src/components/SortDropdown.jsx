import { useEffect, useRef, useState } from 'react';
import { SORT_OPTIONS } from '../utils/showtimesPageEngine.js';

export default function SortDropdown({ sort, setSort }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const labelText = SORT_OPTIONS.find((opt) => opt.value === sort)?.label || 'Sort';

  return (
    <div className="sort-dropdown" ref={ref}>
      <button
        className={`sort-btn${open ? ' open' : ''}`}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {labelText}
      </button>
      {open && (
        <div className="sort-menu" role="listbox">
          {SORT_OPTIONS.map((opt) => (
            <button
              className="sort-option"
              key={opt.value}
              onClick={() => {
                setSort(opt.value);
                setOpen(false);
              }}
              style={{ fontWeight: sort === opt.value ? 700 : 400 }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
