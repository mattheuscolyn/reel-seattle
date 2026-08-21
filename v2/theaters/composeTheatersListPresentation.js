/**
 * Compose Theaters list page presentation from HomeData (T-THEA-10).
 * Enabled venues only; registry insertion order; suppress empty visit slots.
 */

import {
  THEATER_NOW_SHOWING_LIST_LIMIT,
  resolveTheaterPresentation,
} from './resolveTheaterPresentation.js';

/**
 * @param {object | null | undefined} homeData
 * @returns {object}
 */
export function composeTheatersListPresentation(homeData) {
  const byId =
    homeData?.theatersById && typeof homeData.theatersById === 'object'
      ? homeData.theatersById
      : {};

  const orderedIds = Array.isArray(homeData?.theaterOrder)
    ? homeData.theaterOrder.filter((id) => typeof id === 'string' && byId[id])
    : Object.keys(byId);

  const theaters = orderedIds
    .map((id) => byId[id])
    .filter((theater) => {
      if (!theater || typeof theater.id !== 'string' || !theater.id) return false;
      // Omit explicitly disabled registry venues.
      if (theater.enabled === false) return false;
      return true;
    })
    .map((theater, index) => {
      const card = resolveTheaterPresentation({
        theater,
        homeData,
        context: 'list',
      });
      return {
        id: card.id,
        name: card.name,
        addressLabel: card.addressLabel,
        neighborhood: card.neighborhood,
        imageUrl: card.thumbnailUrl ?? card.imageUrl,
        thumbnailUrl: card.thumbnailUrl,
        heroImageUrl: card.heroImageUrl,
        imageAttribution: card.imageAttribution,
        imageLicense: card.imageLicense,
        screensLabel: card.screensLabel,
        formatsLabel: card.formatsLabel,
        description: card.description,
        favorite: card.favorite,
        initiallyExpanded: false,
        nowShowing: card.nowShowing.slice(0, THEATER_NOW_SHOWING_LIST_LIMIT),
        sectionsVisible: card.sectionsVisible,
        openDetailEnabled: true,
      };
    });

  const count = theaters.length;
  return {
    source: 'home-data',
    pageTitle: 'Theaters',
    pageTagline: 'Seattle theaters showing the films you love.',
    countLabel: count === 1 ? '1 theater' : `${count} theaters`,
    filtersLabel: 'Filters',
    nowShowingLabel: 'Now showing',
    viewAllLabel: 'View all',
    moreDetailsLabel: 'More details',
    favoriteLabel: 'Favorite',
    theaters,
    emptyMessage:
      count === 0
        ? 'No theaters available in the current showtimes window.'
        : null,
  };
}
