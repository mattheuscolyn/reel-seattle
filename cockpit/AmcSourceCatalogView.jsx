import { useEffect, useMemo, useState } from 'react';
import {
  buildAmcCatalogDiagnostics,
  buildProductCatalogSummary,
  buildReleaseCatalogSummary,
  filterProducts,
  filterReleases,
  formatMissingScalar,
  formatTimestamp,
  indexProductsByFilmId,
  isMultiProductRelease,
  productHasReleaseLink,
  productLifecycleState,
} from './amcSourceCatalogFormat.js';
import {
  AMC_MOVIE_PRODUCTS_REPO_PATH,
  AMC_MOVIE_PRODUCTS_URL,
  AMC_RELEASE_OBSERVATIONS_REPO_PATH,
  AMC_RELEASE_OBSERVATIONS_URL,
  loadAmcMovieProductsOnce,
  loadAmcReleaseObservationsOnce,
} from './amcSourceCatalogLoader.js';

function TimestampCell({ value }) {
  const formatted = formatTimestamp(value);
  if (!formatted.readable) {
    return <code>{formatted.raw}</code>;
  }
  return (
    <span>
      <code>{formatted.raw}</code>
      <span className="cockpit-secondary"> ({formatted.readable})</span>
    </span>
  );
}

function CountMap({ title, counts }) {
  const entries = Object.entries(counts || {});
  return (
    <div className="cockpit-count-map">
      <h4>{title}</h4>
      {entries.length === 0 ? (
        <p className="cockpit-empty">None</p>
      ) : (
        <ul>
          {entries.map(([key, count]) => (
            <li key={key}>
              <code>{key}</code>: {count}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RawJsonDetails({ record }) {
  return (
    <details className="cockpit-raw-json">
      <summary>Raw record JSON</summary>
      <pre>{JSON.stringify(record, null, 2)}</pre>
    </details>
  );
}

function ProductDetails({ product, onSelectRelease }) {
  const lifecycle = product?.lifecycle || {};
  return (
    <div className="cockpit-catalog-details">
      <h4>Product details</h4>
      <dl className="cockpit-dl">
        <div>
          <dt>source_title</dt>
          <dd>{formatMissingScalar(product.source_title)}</dd>
        </div>
        <div>
          <dt>source_film_id</dt>
          <dd>
            <code>{formatMissingScalar(product.source_film_id)}</code>
          </dd>
        </div>
        <div>
          <dt>source_release_id</dt>
          <dd>
            {productHasReleaseLink(product) ? (
              <button
                type="button"
                className="cockpit-link-button"
                onClick={() => onSelectRelease?.(String(product.source_release_id))}
              >
                <code>{product.source_release_id}</code>
              </button>
            ) : (
              <code>{formatMissingScalar(product.source_release_id)}</code>
            )}
          </dd>
        </div>
        <div>
          <dt>lifecycle</dt>
          <dd>
            <code>{productLifecycleState(product)}</code>
          </dd>
        </div>
        <div>
          <dt>refresh_status</dt>
          <dd>
            <code>{formatMissingScalar(lifecycle.refresh_status)}</code>
          </dd>
        </div>
        <div>
          <dt>first_seen_at</dt>
          <dd>
            <TimestampCell value={lifecycle.first_seen_at} />
          </dd>
        </div>
        <div>
          <dt>last_seen_at</dt>
          <dd>
            <TimestampCell value={lifecycle.last_seen_at} />
          </dd>
        </div>
        <div>
          <dt>last_refreshed_at</dt>
          <dd>
            <TimestampCell value={lifecycle.last_refreshed_at} />
          </dd>
        </div>
        <div>
          <dt>last_successful_refresh_at</dt>
          <dd>
            <TimestampCell value={lifecycle.last_successful_refresh_at} />
          </dd>
        </div>
        <div>
          <dt>inactive_since</dt>
          <dd>
            <TimestampCell value={lifecycle.inactive_since} />
          </dd>
        </div>
        <div>
          <dt>presentation.category</dt>
          <dd>
            <code>
              {formatMissingScalar(product.presentation?.category)}
            </code>
          </dd>
        </div>
        <div>
          <dt>runtime_min</dt>
          <dd>{formatMissingScalar(product.runtime_min)}</dd>
        </div>
        <div>
          <dt>slug</dt>
          <dd>
            <code>{formatMissingScalar(product.slug)}</code>
          </dd>
        </div>
      </dl>
      <RawJsonDetails record={product} />
    </div>
  );
}

function ReleaseDetails({
  release,
  productIndex,
  onSelectProduct,
  missingMemberIds,
}) {
  const lifecycle = release?.lifecycle || {};
  const members = Array.isArray(release?.member_source_film_ids)
    ? release.member_source_film_ids
    : [];
  return (
    <div className="cockpit-catalog-details">
      <h4>Release observation details</h4>
      <p className="cockpit-secondary">
        Source release IDs are grouping evidence only — not a canonical merge.
      </p>
      <dl className="cockpit-dl">
        <div>
          <dt>source_release_id</dt>
          <dd>
            <code>{formatMissingScalar(release.source_release_id)}</code>
          </dd>
        </div>
        <div>
          <dt>member_count</dt>
          <dd>{formatMissingScalar(release.member_count)}</dd>
        </div>
        <div>
          <dt>relationship_status</dt>
          <dd>
            <code>{formatMissingScalar(release.relationship_status)}</code>
          </dd>
        </div>
        <div>
          <dt>first_observed_at</dt>
          <dd>
            <TimestampCell value={lifecycle.first_observed_at} />
          </dd>
        </div>
        <div>
          <dt>last_rebuilt_at</dt>
          <dd>
            <TimestampCell value={lifecycle.last_rebuilt_at} />
          </dd>
        </div>
        <div>
          <dt>observed_titles</dt>
          <dd>{(release.observed_titles || []).join(' · ') || '—'}</dd>
        </div>
      </dl>
      <h4>Member products</h4>
      <ul className="cockpit-member-list">
        {members.map((memberId) => {
          const id = String(memberId);
          const product = productIndex.get(id);
          const missing = missingMemberIds.has(id);
          return (
            <li key={id}>
              {product ? (
                <button
                  type="button"
                  className="cockpit-link-button"
                  onClick={() => onSelectProduct?.(id)}
                >
                  <code>{id}</code> — {formatMissingScalar(product.source_title)}
                </button>
              ) : (
                <span>
                  <code>{id}</code>
                  {missing ? (
                    <span className="cockpit-warning-tag"> · missing from products</span>
                  ) : null}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <h4>Relationship observations</h4>
      <pre className="cockpit-inline-json">
        {JSON.stringify(release.relationship_observations || {}, null, 2)}
      </pre>
      <RawJsonDetails record={release} />
    </div>
  );
}

const EMPTY_PRODUCT_FILTERS = {
  query: '',
  lifecycle: '',
  refreshStatus: '',
  releaseLink: '',
};

const EMPTY_RELEASE_FILTERS = {
  query: '',
  memberSize: '',
  relationshipStatus: '',
};

/**
 * Read-only AMC source-product and release-observation catalog inspection.
 */
export default function AmcSourceCatalogView() {
  const [tab, setTab] = useState('products');
  const [productsCatalog, setProductsCatalog] = useState(null);
  const [releasesCatalog, setReleasesCatalog] = useState(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [releasesLoading, setReleasesLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);
  const [releasesError, setReleasesError] = useState(null);
  const [productFilters, setProductFilters] = useState(EMPTY_PRODUCT_FILTERS);
  const [releaseFilters, setReleaseFilters] = useState(EMPTY_RELEASE_FILTERS);
  const [selectedFilmId, setSelectedFilmId] = useState(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadAmcMovieProductsOnce()
      .then((artifact) => {
        if (!cancelled) {
          setProductsCatalog(artifact);
          setProductsError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setProductsCatalog(null);
          setProductsError(
            error instanceof Error ? error.message : String(error),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAmcReleaseObservationsOnce()
      .then((artifact) => {
        if (!cancelled) {
          setReleasesCatalog(artifact);
          setReleasesError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setReleasesCatalog(null);
          setReleasesError(
            error instanceof Error ? error.message : String(error),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setReleasesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const productSummary = useMemo(
    () => (productsCatalog ? buildProductCatalogSummary(productsCatalog) : null),
    [productsCatalog],
  );
  const releaseSummary = useMemo(
    () => (releasesCatalog ? buildReleaseCatalogSummary(releasesCatalog) : null),
    [releasesCatalog],
  );
  const diagnostics = useMemo(
    () => buildAmcCatalogDiagnostics(productsCatalog, releasesCatalog),
    [productsCatalog, releasesCatalog],
  );
  const productIndex = useMemo(
    () => indexProductsByFilmId(productsCatalog),
    [productsCatalog],
  );

  const filteredProducts = useMemo(
    () => filterProducts(productsCatalog?.products, productFilters),
    [productsCatalog, productFilters],
  );
  const filteredReleases = useMemo(
    () => filterReleases(releasesCatalog?.releases, releaseFilters),
    [releasesCatalog, releaseFilters],
  );

  const selectedProduct = selectedFilmId
    ? productIndex.get(selectedFilmId) || null
    : null;
  const selectedRelease =
    selectedReleaseId && releasesCatalog?.releases
      ? releasesCatalog.releases.find(
          (release) => String(release.source_release_id) === selectedReleaseId,
        ) || null
      : null;

  const missingMemberIds = useMemo(() => {
    const set = new Set();
    for (const item of diagnostics.missingMemberProducts) {
      set.add(item.sourceFilmId);
    }
    return set;
  }, [diagnostics]);

  function selectProduct(filmId) {
    setSelectedFilmId(filmId);
    setTab('products');
  }

  function selectRelease(releaseId) {
    setSelectedReleaseId(releaseId);
    setTab('releases');
  }

  function showMultiProductOnly() {
    setReleaseFilters((prev) => ({ ...prev, memberSize: 'multi' }));
    setTab('releases');
  }

  return (
    <section className="cockpit-section" aria-labelledby="amc-catalog-heading">
      <h2 id="amc-catalog-heading">AMC Source Catalog</h2>
      <p className="cockpit-secondary">
        Local-only inspection of durable internal AMC catalogs. Not public, not
        Pages, not a canonical film identity model. Release IDs are{' '}
        <strong>grouping evidence only</strong>.
      </p>

      {diagnostics.warnings.length > 0 ? (
        <div className="cockpit-error" role="status">
          <h3>Cross-catalog inspection warnings</h3>
          <ul>
            {diagnostics.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <p className="cockpit-secondary">
            Unresolved member references: {diagnostics.unresolvedMemberCount}.
            These warnings do not block browsing valid records.
          </p>
        </div>
      ) : null}

      <div className="cockpit-tab-bar" role="tablist" aria-label="AMC catalog tabs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'products'}
          className={
            tab === 'products' ? 'cockpit-tab cockpit-tab--active' : 'cockpit-tab'
          }
          onClick={() => setTab('products')}
        >
          Source Products
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'releases'}
          className={
            tab === 'releases' ? 'cockpit-tab cockpit-tab--active' : 'cockpit-tab'
          }
          onClick={() => setTab('releases')}
        >
          Release Observations
        </button>
      </div>

      {tab === 'products' ? (
        <div>
          {productsLoading ? (
            <p className="cockpit-loading" role="status">
              Loading AMC movie products catalog…
            </p>
          ) : null}

          {!productsLoading && productsError ? (
            <div className="cockpit-error" role="alert">
              <h3>Unable to load AMC movie products catalog</h3>
              <p>{productsError}</p>
              <p>
                Expected artifact path:{' '}
                <code>{AMC_MOVIE_PRODUCTS_REPO_PATH}</code>
              </p>
              <p>
                Requested URL: <code>{AMC_MOVIE_PRODUCTS_URL}</code>
              </p>
            </div>
          ) : null}

          {!productsLoading && !productsError && productSummary ? (
            <>
              <div className="cockpit-registry-summary">
                <h3>Product catalog summary</h3>
                <dl className="cockpit-dl">
                  <div>
                    <dt>schema_version</dt>
                    <dd>
                      <code>{productSummary.schemaVersion}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>generated_at</dt>
                    <dd>
                      <TimestampCell value={productsCatalog.generated_at} />
                    </dd>
                  </div>
                  <div>
                    <dt>source</dt>
                    <dd>
                      <code>{productSummary.source}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>total products</dt>
                    <dd>{productSummary.totalProducts}</dd>
                  </div>
                  <div>
                    <dt>active / inactive</dt>
                    <dd>
                      {productSummary.activeProducts} /{' '}
                      {productSummary.inactiveProducts}
                    </dd>
                  </div>
                  <div>
                    <dt>with / without release id</dt>
                    <dd>
                      {productSummary.withReleaseId} /{' '}
                      {productSummary.withoutReleaseId}
                    </dd>
                  </div>
                  <div>
                    <dt>never successfully refreshed</dt>
                    <dd>{productSummary.neverSuccessfullyRefreshed}</dd>
                  </div>
                </dl>
                <div className="cockpit-registry-counts">
                  <CountMap
                    title="Refresh status (from records)"
                    counts={productSummary.refreshCounts}
                  />
                  <CountMap
                    title="Stored stats (artifact)"
                    counts={productSummary.storedStats}
                  />
                </div>
              </div>

              <form
                className="cockpit-inspect-form"
                onSubmit={(event) => event.preventDefault()}
              >
                <div className="cockpit-inspect-controls">
                  <label className="cockpit-field">
                    Search title / film id / release id
                    <input
                      type="search"
                      value={productFilters.query}
                      onChange={(event) =>
                        setProductFilters((prev) => ({
                          ...prev,
                          query: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="cockpit-field">
                    Lifecycle
                    <select
                      value={productFilters.lifecycle}
                      onChange={(event) =>
                        setProductFilters((prev) => ({
                          ...prev,
                          lifecycle: event.target.value,
                        }))
                      }
                    >
                      <option value="">All</option>
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </label>
                  <label className="cockpit-field">
                    Refresh status
                    <select
                      value={productFilters.refreshStatus}
                      onChange={(event) =>
                        setProductFilters((prev) => ({
                          ...prev,
                          refreshStatus: event.target.value,
                        }))
                      }
                    >
                      <option value="">All</option>
                      <option value="pending">pending</option>
                      <option value="success">success</option>
                      <option value="stale">stale</option>
                      <option value="failed">failed</option>
                      <option value="invalid">invalid</option>
                    </select>
                  </label>
                  <label className="cockpit-field">
                    Release link
                    <select
                      value={productFilters.releaseLink}
                      onChange={(event) =>
                        setProductFilters((prev) => ({
                          ...prev,
                          releaseLink: event.target.value,
                        }))
                      }
                    >
                      <option value="">All</option>
                      <option value="linked">linked</option>
                      <option value="unlinked">unlinked</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setProductFilters(EMPTY_PRODUCT_FILTERS)}
                  >
                    Clear filters
                  </button>
                </div>
              </form>

              <p className="cockpit-secondary" role="status">
                Showing {filteredProducts.length} of {productSummary.totalProducts}{' '}
                products
              </p>

              {filteredProducts.length === 0 ? (
                <p className="cockpit-empty" role="status">
                  No products match the current filters.
                </p>
              ) : (
                <div className="cockpit-table-wrap">
                  <table className="cockpit-table">
                    <thead>
                      <tr>
                        <th>title</th>
                        <th>source_film_id</th>
                        <th>source_release_id</th>
                        <th>lifecycle</th>
                        <th>refresh</th>
                        <th>last_successful_refresh_at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((product) => {
                        const filmId = String(product.source_film_id);
                        const selected = filmId === selectedFilmId;
                        return (
                          <tr
                            key={filmId}
                            className={selected ? 'cockpit-row--selected' : undefined}
                          >
                            <td>
                              <button
                                type="button"
                                className="cockpit-link-button"
                                onClick={() => selectProduct(filmId)}
                              >
                                {formatMissingScalar(product.source_title)}
                              </button>
                            </td>
                            <td>
                              <code>{filmId}</code>
                            </td>
                            <td>
                              <code>
                                {formatMissingScalar(product.source_release_id)}
                              </code>
                            </td>
                            <td>
                              <code>{productLifecycleState(product)}</code>
                            </td>
                            <td>
                              <code>
                                {formatMissingScalar(
                                  product.lifecycle?.refresh_status,
                                )}
                              </code>
                            </td>
                            <td>
                              <code>
                                {formatMissingScalar(
                                  product.lifecycle?.last_successful_refresh_at,
                                )}
                              </code>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedProduct ? (
                <ProductDetails
                  product={selectedProduct}
                  onSelectRelease={selectRelease}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <div>
          {releasesLoading ? (
            <p className="cockpit-loading" role="status">
              Loading AMC release observations catalog…
            </p>
          ) : null}

          {!releasesLoading && releasesError ? (
            <div className="cockpit-error" role="alert">
              <h3>Unable to load AMC release observations catalog</h3>
              <p>{releasesError}</p>
              <p>
                Expected artifact path:{' '}
                <code>{AMC_RELEASE_OBSERVATIONS_REPO_PATH}</code>
              </p>
              <p>
                Requested URL: <code>{AMC_RELEASE_OBSERVATIONS_URL}</code>
              </p>
            </div>
          ) : null}

          {!releasesLoading && !releasesError && releaseSummary ? (
            <>
              <div className="cockpit-registry-summary">
                <h3>Release observations summary</h3>
                <dl className="cockpit-dl">
                  <div>
                    <dt>schema_version</dt>
                    <dd>
                      <code>{releaseSummary.schemaVersion}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>generated_at</dt>
                    <dd>
                      <TimestampCell value={releasesCatalog.generated_at} />
                    </dd>
                  </div>
                  <div>
                    <dt>source</dt>
                    <dd>
                      <code>{releaseSummary.source}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>total release observations</dt>
                    <dd>{releaseSummary.totalReleases}</dd>
                  </div>
                  <div>
                    <dt>singleton / multi-product groups</dt>
                    <dd>
                      {releaseSummary.singletonGroups} /{' '}
                      {releaseSummary.multiProductGroups}{' '}
                      {releaseSummary.multiProductGroups > 0 ? (
                        <button
                          type="button"
                          className="cockpit-link-button"
                          onClick={showMultiProductOnly}
                        >
                          (show multi-product only)
                        </button>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>linked product memberships</dt>
                    <dd>{releaseSummary.linkedMemberships}</dd>
                  </div>
                </dl>
                <div className="cockpit-registry-counts">
                  <CountMap
                    title="Relationship status"
                    counts={releaseSummary.relationshipStatusCounts}
                  />
                  <CountMap
                    title="Stored stats (artifact)"
                    counts={releaseSummary.storedStats}
                  />
                </div>
              </div>

              <form
                className="cockpit-inspect-form"
                onSubmit={(event) => event.preventDefault()}
              >
                <div className="cockpit-inspect-controls">
                  <label className="cockpit-field">
                    Search release id / member film id
                    <input
                      type="search"
                      value={releaseFilters.query}
                      onChange={(event) =>
                        setReleaseFilters((prev) => ({
                          ...prev,
                          query: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="cockpit-field">
                    Member size
                    <select
                      value={releaseFilters.memberSize}
                      onChange={(event) =>
                        setReleaseFilters((prev) => ({
                          ...prev,
                          memberSize: event.target.value,
                        }))
                      }
                    >
                      <option value="">All</option>
                      <option value="single">single-member</option>
                      <option value="multi">multi-product</option>
                    </select>
                  </label>
                  <label className="cockpit-field">
                    Relationship status
                    <select
                      value={releaseFilters.relationshipStatus}
                      onChange={(event) =>
                        setReleaseFilters((prev) => ({
                          ...prev,
                          relationshipStatus: event.target.value,
                        }))
                      }
                    >
                      <option value="">All</option>
                      <option value="grouping_evidence_only">
                        grouping_evidence_only
                      </option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setReleaseFilters(EMPTY_RELEASE_FILTERS)}
                  >
                    Clear filters
                  </button>
                </div>
              </form>

              <p className="cockpit-secondary" role="status">
                Showing {filteredReleases.length} of {releaseSummary.totalReleases}{' '}
                release observations
              </p>

              {filteredReleases.length === 0 ? (
                <p className="cockpit-empty" role="status">
                  No release observations match the current filters.
                </p>
              ) : (
                <div className="cockpit-table-wrap">
                  <table className="cockpit-table">
                    <thead>
                      <tr>
                        <th>source_release_id</th>
                        <th>members</th>
                        <th>member_count</th>
                        <th>relationship_status</th>
                        <th>observed titles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReleases.map((release) => {
                        const releaseId = String(release.source_release_id);
                        const selected = releaseId === selectedReleaseId;
                        const multi = isMultiProductRelease(release);
                        return (
                          <tr
                            key={releaseId}
                            className={selected ? 'cockpit-row--selected' : undefined}
                          >
                            <td>
                              <button
                                type="button"
                                className="cockpit-link-button"
                                onClick={() => selectRelease(releaseId)}
                              >
                                <code>{releaseId}</code>
                              </button>
                              {multi ? (
                                <span className="cockpit-badge"> multi-product</span>
                              ) : null}
                            </td>
                            <td>
                              <code>
                                {(release.member_source_film_ids || []).join(', ')}
                              </code>
                            </td>
                            <td>{formatMissingScalar(release.member_count)}</td>
                            <td>
                              <code>
                                {formatMissingScalar(release.relationship_status)}
                              </code>
                            </td>
                            <td className="cockpit-cell-wrap">
                              {(release.observed_titles || []).join(' · ')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedRelease ? (
                <ReleaseDetails
                  release={selectedRelease}
                  productIndex={productIndex}
                  onSelectProduct={selectProduct}
                  missingMemberIds={missingMemberIds}
                />
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
