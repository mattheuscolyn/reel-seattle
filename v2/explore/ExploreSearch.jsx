import { useId, useState } from 'react';
import { IconSearch } from '../icons.jsx';
import PageHeader from '../shell/PageHeader.jsx';
import { SEARCH_PLACEHOLDER } from './searchCopy.js';

/**
 * Explore page intro + search field.
 */
export default function ExploreSearch({
  initialQuery = '',
  onSubmit,
}) {
  const inputId = useId();
  const [query, setQuery] = useState(initialQuery);

  const submit = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onSubmit?.(trimmed);
  };

  return (
    <PageHeader
      className="v2-explore-intro"
      title="Explore"
      subtitle="Find the movies, theaters, and experiences you’re looking for."
      titleId="v2-explore-title"
      titleClassName="v2-explore-title"
      subtitleClassName="v2-explore-lede"
    >
      <div className="v2-explore-search">
        <label className="v2-visually-hidden" htmlFor={inputId}>
          {SEARCH_PLACEHOLDER}
        </label>
        <input
          id={inputId}
          className="v2-explore-search-input"
          type="search"
          value={query}
          placeholder={SEARCH_PLACEHOLDER}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          className="v2-explore-search-submit"
          aria-label="Search"
          onClick={submit}
        >
          <IconSearch />
        </button>
      </div>
    </PageHeader>
  );
}
