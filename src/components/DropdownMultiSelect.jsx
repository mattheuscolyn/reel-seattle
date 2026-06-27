import { useEffect, useRef, useState } from 'react';

export default function DropdownMultiSelect({ label, options, selected, setSelected }) {
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

  const toggleOption = (opt) => {
    if (selected.includes(opt)) {
      setSelected(selected.filter((o) => o !== opt));
    } else {
      setSelected([...selected, opt]);
    }
  };

  const labelText = selected.length === 0 ? label : `${label} (${selected.length})`;

  return (
    <div className="dropdown-multiselect" ref={ref}>
      <button
        className={`dropdown-btn${open ? ' open' : ''}`}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {labelText}
      </button>
      {open && (
        <div className="dropdown-menu" role="listbox">
          {options.map((opt) => (
            <label className="dropdown-option" key={opt}>
              <input
                type="checkbox"
                className="dropdown-checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggleOption(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
