/**
 * Experimental 3-cycle AMC allocation model.
 * Eligibility is a HARD GATE: unknown or false products never appear.
 * Dates are Pacific wall-clock showtimes. Forecast estimates are used only
 * when a shadow artifact is fresh and aligned to the applicable week.
 */
import { resolveAListCreditWeek, A_LIST_WEEKLY_ALLOWANCE } from './aListWeeklyReport.js';
import { addIsoDays, pacificDateString } from '../explore/exploreCatalog.js';
import { opportunitySortableKey } from '../showtimes/showtimeEligibility.js';
import { filmsByKeyFromHomeData, isQualifyingFutureOpportunity } from '../showtimes/qualifyingShowtimes.js';
import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';
import { getSavedFilms, savedFilmRefsEqual } from '../stores/savedFilmsStore.js';
import { getSeenFilms } from '../stores/seenFilmsStore.js';
import { getNotInterestedFilms } from '../stores/notInterestedFilmsStore.js';

const MS_DAY = 86400000;
const MAX_FRESH_DAYS = 3;
const ALLOCATE_WEEKS = 3;

export function buildEligibilityIndex(catalog) {
  if (catalog?.schema_version !== 1 || !Array.isArray(catalog.products)) return null;
  const index = new Map();
  for (const row of catalog.products) {
    if (!/^\d+$/.test(String(row?.amc_movie_id ?? '')) || typeof row?.a_list_eligible !== 'boolean') continue;
    index.set(String(row.amc_movie_id), row);
  }
  return index.size ? index : null;
}

function creditWindow(week, index) {
  const startDate = addIsoDays(week.startDate, 7 * index);
  const endDate = addIsoDays(startDate, 7);
  return {
    startDate, endDate,
    startKey: startDate + 'T06:00',
    endKey: endDate + 'T06:00',
    lastDate: addIsoDays(endDate, -1),
  };
}

function weekday(isoDate) {
  return new Date(isoDate + 'T12:00:00Z').getUTCDay();
}

function isoTimeMs(iso) {
  const v = Date.parse(iso || '');
  return Number.isFinite(v) ? v : null;
}

function preference(refs, values) {
  return refs.some((ref) => values.some((item) => savedFilmRefsEqual(ref, item.filmRef)));
}

function sourceId(opp) {
  const val = String(opp?.sourceFilmId || '').trim();
  return /^\d+$/.test(val) ? val : null;
}

function importance(row) {
  // Editorial proxy based on explainable evidence, NOT a critical consensus
  // or claim that individual movies are objectively important.
  let score = row.mustSee ? 9 : row.saved ? 6 : 2.9;
  if (row.kind === 'standard') score += 0.7;
  if (row.kind === 'anniversary_or_rerelease') score += 1.3;
  if (row.kind === 'concert_or_event') score -= 0.5;
  if (row.isMystery) score -= 4;
  if (row.recentRelease) score += 0.6;
  // Repertory restorations may be listed by AMC as ordinary products.
  // TMDB's original release year distinguishes them from new wide releases.
  if (row.classicRevival) score += 1.9;
  if (row.popularitySignal) score += row.popularitySignal;
  if (row.theaters >= 3) score += 0.5;
  if (row.theaters === 1 && row.kind === 'standard') score += 0.2;
  return score;
}

function readyForecast(forecasts, row, week, now) {
  if (!forecasts || forecasts.modelVersion !== 'remaining_run_shadow_v1') return null;
  const asOfMs = isoTimeMs(forecasts.asOf + 'T12:00:00Z');
  const today = new Date(pacificDateString(now) + 'T12:00:00Z');
  if (asOfMs == null || (today.getTime() - asOfMs) / MS_DAY > MAX_FRESH_DAYS || asOfMs > today.getTime() + MS_DAY) return null;
  const list = Array.isArray(forecasts.market) ? forecasts.market : [];
  const prediction = list.find((r) => row.sourceIds.has(String(r.sourceFilmId ?? r.filmId)) &&
    r.currentProgrammingWeek === week.startDate && r.forecastState !== 'unavailable');
  if (!prediction || ![prediction.pFinalWeek, prediction.pPlus1Week, prediction.pPlus2Weeks, prediction.pPlus3PlusWeeks].every(x => typeof x === 'number' && x >= 0 && x <= 1)) return null;
  const buckets = [prediction.pFinalWeek, prediction.pPlus1Week, prediction.pPlus2Weeks, prediction.pPlus3PlusWeeks];
  if (Math.abs(buckets.reduce((a,b)=>a+b,0)-1)>0.02) return null;
  const likely = buckets.indexOf(Math.max(...buckets));
  const lastStart = addIsoDays(week.startDate, likely * 7);
  return {
    pFinalWeek: buckets[0], buckets,
    likelyFinalWeek: likely === 3 ? null : { startDate: lastStart, endDate: addIsoDays(lastStart, 6) },
    furtherWeeksPossible: likely === 3,
    asOf: forecasts.asOf,
    forecastState: prediction.forecastState,
  };
}

function expectedDemand(comingSoon, eligible, weeks) {
  const output = weeks.map(() => ({ confirmed: 0, anticipated: 0, titles: [] }));
  if (!Array.isArray(comingSoon?.entries)) return output;
  const seen = new Set();
  for (const entry of comingSoon.entries) {
    const date = entry.expected_release_date;
    const ids = Array.isArray(entry.amc_movie_ids) ? entry.amc_movie_ids : [entry.amc_movie_id];
    if (!date || !ids.some(id => eligible.get(String(id))?.a_list_eligible === true)) continue;
    const ix = weeks.findIndex(w => date >= w.startDate && date < w.endDate);
    if (ix < 0) continue;
    const key = entry.film_id || entry.join_key || entry.title;
    if (!key || seen.has(ix + '|' + key)) continue;
    seen.add(ix + '|' + key);
    const local = entry.local_status === 'confirmed' || entry.relevance_tier === 'confirmed_local' ||
      entry.relevance_tier === 'locally_announced' || entry.evidence?.amc_theater_booking === true;
    if (local) output[ix].confirmed++;
    else if (entry.relevance_tier === 'strongly_expected' || entry.classification === 'amc_announced') output[ix].anticipated++;
    else continue;
    output[ix].titles.push(entry.title);
  }
  return output;
}

function candidateReason(row, selected, forecast, weekIndex) {
  if (row.thursdayOpening) return 'Opens Thursday; usually better with next Friday’s credits';
  if (row.earlyAccess) return 'Special advance screening before the regular release';
  if (row.oneDayEngagement) return 'Limited to one currently listed day';
  if (forecast && forecast.pFinalWeek >= 0.6) return 'High forecast risk of leaving after this programming week';
  if (row.nextConfirmed) return 'Confirmed AMC showtimes in the following credit week';
  if (row.saved || row.mustSee) return 'On your watchlist; future AMC schedule not yet confirmed';
  return 'Available at AMC; future run is uncertain';
}

function assignThreeWeeks(rows, weeks, credits, demands) {
  // Greedy opportunity-cost simulation: scarce films get an early slot,
  // while broad releases can move later unless demand is very high there.
  // Deterministic, reevaluated on each refresh; not a validated optimal solver.
  const pools = weeks.map((w,i) => ({
    index:i, capacity:Math.max(0, Math.min(4, credits[i])),
    demand:demands[i].confirmed + 0.45*demands[i].anticipated,
    allocations:[],
  }));
  const sorted = [...rows].filter(r => r.windows.some(w=>w.length)).sort((a,b) =>
    b.importance - a.importance || a.title.localeCompare(b.title));
  for (const row of sorted) {
    const available = pools.filter(p=>p.capacity>p.allocations.length && row.windows[p.index].length);
    if (!available.length) continue;
    const best = available.map(p=>{
      const next = row.windows.findIndex((w,i)=>i>p.index&&w.length);
      const last = row.windows.reduce((n,w,i)=>w.length?i:n,-1);
      const scarcity = next<0?1.7:0;
      const Thursday = row.thursdayWindows[p.index] ? -6.0 : 0;
      const early = p.index===0 && row.earlyAccess && row.hasLaterRegular ? -3 : 0;
      const confirmed = next>=0 ? -0.35:0;
      const pressure = p.demand*0.22;
      const fill = p.allocations.length*0.48;
      const closeness = -p.index*0.1;
      const score = row.importance + scarcity + Thursday + early + confirmed - pressure - fill + closeness +
        (last===p.index && row.saved ? 0.7 : 0);
      return {p,score};
    }).sort((a,b)=>b.score-a.score||a.p.index-b.p.index)[0];
    if (best) {
      best.p.allocations.push(row.identity);
      row.proposedWeek = best.p.index;
    }
  }
  return pools;
}

/**
 * Returns top six per selected week, other eligible movies, previews,
 * and a 3-week tentative allocation (not a promise of seats/showtimes).
 */
export function buildAListRecommendations({
  homeData=null, catalog=null, comingSoon=null, shadow=null, enrichmentIndex=null,
  storage=null, now=new Date(), weekOffset=0, creditsByWeek=[4,4,4], priorityIds=[],
}={}) {
  const eligible=buildEligibilityIndex(catalog);
  const base=resolveAListCreditWeek(now, 0);
  const weeks=Array.from({length:ALLOCATE_WEEKS},(_,i)=>creditWindow(base,i));
  const selectedIndex=weekOffset===1?1:0;
  const currentWindow=weeks[selectedIndex];
  const fallback = { status:!eligible?'eligibility_unavailable':'ready', week:currentWindow,
    top:[],alternatives:[],thursdayPremieres:[],other:[],demand:weeks.map(()=>({confirmed:0,anticipated:0,titles:[]})),
    allocations:[],coverage:{eligibleProducts:eligible?.size||0,excluded:0,unverified:0},weeks };
  if (!eligible) return fallback;
  const filmIndex=filmsByKeyFromHomeData(homeData);
  const groups=new Map();
  const exclusions={excluded:0,unverified:0};
  const currentKey=base.nowKey;
  const all = Array.isArray(homeData?.opportunities)?homeData.opportunities:[];
  const seen=getSeenFilms(storage),notInterested=getNotInterestedFilms(storage),saved=getSavedFilms(storage);
  for(const opp of all){
    if (String(opp?.source||'').toLowerCase()!=='amc' && !/^amc(?:-|$)/i.test(String(opp?.theaterId||'')))continue;
    const sid=sourceId(opp);
    const product=sid?eligible.get(sid):null;
    if(!product){exclusions.unverified++;continue;}
    if(!product.a_list_eligible){exclusions.excluded++;continue;}
    if(!isQualifyingFutureOpportunity(opp,{filmsByKey:filmIndex,now}))continue;
    const key=opportunitySortableKey(opp);
    const ix=weeks.findIndex((w,i)=>key >= (i===0?currentKey:w.startKey)&&key<w.endKey);
    if(ix<0)continue;
    const film=filmIndex.get(opp.filmKey);
    if(!film)continue;
    const identity=/^tmdb:[1-9]\d*$/.test(film.filmId||'')?film.filmId:film.parentFilmKey||film.filmKey;
    let g=groups.get(identity);
    if(!g){g={identity,filmKey:film.filmKey,filmId:film.filmId||null,title:film.parentDisplayTitle||film.title,
      posterUrl:film.posterUrl||null,refs:[],sourceIds:new Set(),products:[],windows:[[],[],[]],
      days:[new Set(),new Set(),new Set()],theaterIds:new Set()};groups.set(identity,g);}
    const ref=filmRefFromHomeFilm(film);
    if(ref)g.refs.push(ref);
    g.sourceIds.add(sid);g.products.push(product);g.windows[ix].push({opp,key,product});
    g.days[ix].add(opp.localDate);g.theaterIds.add(opp.theaterId);
  }
  let rows=[];
  for(const g of groups.values()){
    if(preference(g.refs,seen)||preference(g.refs,notInterested))continue;
    g.saved=preference(g.refs,saved);g.mustSee=priorityIds.includes(g.identity);
    g.theaters=g.theaterIds.size;
    const regular=g.products.filter(p=>p.presentation_kind==='standard');
    const releaseDates=regular.map(p=>p.release_date).filter(Boolean).sort();
    g.releaseDate=releaseDates[0]||g.products.map(p=>p.release_date).filter(Boolean).sort()[0]||null;
    g.kind=regular.length?'standard':g.products[0]?.presentation_kind||'unknown';
    g.isMystery=g.products.some(p=>p.presentation_kind==='mystery_screening')||
      /^AMC(?: Screen Unseen)?$/i.test(g.title||'');
    if(g.isMystery)continue; // No unknown-film dummy recommendation.
    g.earlyAccess=Boolean(g.releaseDate && g.windows.some((w,ix)=>w.some(x=>x.opp.localDate<g.releaseDate &&
      x.product.presentation_kind!=='standard')));
    g.hasLaterRegular=g.windows.some(w=>w.some(x=>x.product.presentation_kind==='standard'&&
      (!g.releaseDate||x.opp.localDate>=g.releaseDate)));
    g.thursdayWindows=weeks.map((w,ix)=>Boolean(g.releaseDate&&g.releaseDate>=w.endDate&&
      g.windows[ix].length &&g.windows[ix].every(x=>x.opp.localDate===w.lastDate) &&
      g.windows[ix].every(x=>x.product.presentation_kind==='standard')));
    g.thursdayOpening=g.thursdayWindows[selectedIndex];
    g.oneDayEngagement=g.days[selectedIndex].size===1 &&
      g.kind!=='standard' && !g.earlyAccess;
    g.recentRelease=g.releaseDate &&g.releaseDate>=addIsoDays(base.startDate,-14);
    const year=enrichmentIndex?.byFilmId?.get(g.filmId)?.release_year;
    g.classicRevival=Number.isInteger(year)&&
      year<Number(base.startDate.slice(0,4))-9 &&
      g.releaseDate && Number(g.releaseDate.slice(0,4))>year+9;
    const upcoming=Array.isArray(comingSoon?.entries)
      ? comingSoon.entries.find(e => (Array.isArray(e.amc_movie_ids)
          ? e.amc_movie_ids : [e.amc_movie_id]).some(id=>g.sourceIds.has(String(id))))
      : null;
    g.popularitySignal=typeof upcoming?.tmdb_popularity==='number' &&
      Number.isFinite(upcoming.tmdb_popularity)
      ? Math.min(2.0,Math.log2(1+Math.max(0,upcoming.tmdb_popularity))*0.32):0;
    g.importance=importance(g);
    g.nextConfirmed=Boolean(g.windows[selectedIndex+1]?.length);
    rows.push(g);
  }
  const demand=expectedDemand(comingSoon,eligible,weeks);
  const creditCounts=weeks.map((w,i)=>Number.isInteger(creditsByWeek[i])?creditsByWeek[i]:4);
  const allocations=assignThreeWeeks(rows,weeks,creditCounts,demand);
  const selected=rows.filter(r=>r.windows[selectedIndex].length);
  for(const row of selected){
    row.thursdayOpening=row.thursdayWindows[selectedIndex];
    row.forecast=selectedIndex===0 ? readyForecast(shadow,row,weeks[0],now):null;
    row.thisWeekShowtimes=row.windows[selectedIndex].length;
    row.nextWeekShowtimes=row.windows[selectedIndex+1]?.length||0;
    row.theaterCount=row.theaters;
    row.reason=candidateReason(row,selected,row.forecast,selectedIndex);
    row.predictedLeaving=row.forecast?.likelyFinalWeek||null;
    row.score=row.importance + (row.forecast?.pFinalWeek||0)*2 +
      (row.oneDayEngagement?1:0) +
      (!row.nextConfirmed&&row.saved?0.5:0) -
      (row.thursdayOpening?8:0) -
      (row.earlyAccess&&row.hasLaterRegular?3:0) +
      (row.proposedWeek===selectedIndex?2:0);
  }
  const ranking=(a,b)=>b.score-a.score||a.title.localeCompare(b.title);
  const normal=selected.filter(r=>!r.thursdayOpening).sort(ranking);
  const top=normal.slice(0,6);
  return {
    status:'ready', week:currentWindow, weeks, top,
    alternatives:normal.slice(6),
    thursdayPremieres:selected.filter(r=>r.thursdayOpening).sort(ranking),
    other:normal.slice(6),
    demand, allocations,
    coverage:{eligibleProducts:eligible.size,...exclusions},
    forecastStatus:top.some(x=>x.forecast)?'available':'unavailable',
  };
}
