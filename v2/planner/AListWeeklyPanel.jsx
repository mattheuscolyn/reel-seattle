import { useEffect, useMemo, useState } from 'react';
import { A_LIST_WEEKLY_ALLOWANCE, readAListUsed, resolveAListCreditWeek, writeAListUsed } from './aListWeeklyReport.js';
import { buildAListRecommendations } from './aListRecommendationEngine.js';
import { loadAListSignals } from './loadAListSignals.js';
import { subscribeFilmStoreMutations } from '../auth/filmStoreMutationBridge.js';
import './aListWeeklyPanel.css';

const PRIORITY_KEY = 'reel-seattle.v2.aListMustSee.v1';

function browserStorage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
}
export function readAListPriorities(storage) {
  try {
    const value = JSON.parse(storage?.getItem(PRIORITY_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter(id => typeof id === 'string' && id.length < 130).slice(0,300) : [];
  } catch { return []; }
}
function dateLabel(date) {
  const [y,m,d]=date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'})
    .format(new Date(Date.UTC(y,m-1,d,12)));
}

function Poster({row}) {
  return row.posterUrl
    ? <img className="v2-alist-poster" src={row.posterUrl} alt="" loading="lazy" />
    : <div className="v2-alist-poster v2-alist-poster-empty" aria-hidden="true"/>;
}
function FilmRow({row,number,onOpenFilmDetail,onToggleMustSee,condensed=false}) {
  const bucket=row.forecast?.buckets;
  const leaving=row.predictedLeaving;
  const forecastLabel=leaving
    ? `Predicted final week: ${dateLabel(leaving.startDate)}–${dateLabel(leaving.endDate)} (${Math.round(Math.max(...bucket)*100)}% for most likely range)`
    : null;
  return (
    <li className="v2-alist-film">
      <Poster row={row}/>
      <div className="v2-alist-film-body">
        <div className="v2-alist-film-topline">
          {number != null ? <span className="v2-alist-rank">{number}.</span> : null}
          <button type="button" className="v2-alist-film-title"
            onClick={() => onOpenFilmDetail?.({filmKey:row.filmKey})}>{row.title}</button>
        </div>
        <p className="v2-alist-film-meta">
          {row.saved?'Saved · ':''}{row.mustSee?'Must-see · ':''}
          {row.thisWeekShowtimes} listed {row.nextConfirmed?'· Booked next week':''}
        </p>
        {!condensed ? (
          <>
            <p className="v2-alist-reason">{row.reason}</p>
            {leaving ? <p className="v2-alist-forecast">{forecastLabel}</p> : null}
            <button type="button" className="v2-alist-priority" aria-pressed={row.mustSee}
              onClick={()=>onToggleMustSee(row.identity)}>{row.mustSee?'★ Must-see':'☆ Mark must-see'}</button>
          </>
        ):null}
      </div>
    </li>
  );
}

/** Experimental planning guidance; all recommendation candidates have positive
 * product-level eligibility from the AMC source catalog. */
export default function AListWeeklyPanel({homeData,onOpenFilmDetail}) {
  const storage=browserStorage();
  const [expanded,setExpanded]=useState(false);
  const [weekOffset,setWeekOffset]=useState(0);
  const [now,setNow]=useState(()=>new Date());
  const [revision,setRevision]=useState(0);
  const [signals,setSignals]=useState(null);
  const [loadStatus,setLoadStatus]=useState('idle');
  const [usedByWeek,setUsedByWeek]=useState({});
  const [priorityIds,setPriorityIds]=useState(()=>readAListPriorities(browserStorage()));
  const [error,setError]=useState('');
  useEffect(()=>subscribeFilmStoreMutations(()=>setRevision(n=>n+1)),[]);
  useEffect(()=>{
    const focus=()=>setNow(new Date());
    window.addEventListener('focus',focus);
    return ()=>window.removeEventListener('focus',focus);
  },[]);
  useEffect(()=>{
    if(!expanded || loadStatus!=='idle')return;
    let active=true;
    setLoadStatus('loading');
    loadAListSignals().then(data=>{
      if(!active)return;
      setSignals(data);
      setLoadStatus(data.catalog?'ready':'unavailable');
    }).catch(()=>{if(active)setLoadStatus('unavailable');});
    return ()=>{active=false;setLoadStatus('idle');};
  },[expanded,loadStatus]);
  const todayWeek=resolveAListCreditWeek(now);
  const selectedWeek=resolveAListCreditWeek(now,weekOffset);
  const selectedUsed=usedByWeek[selectedWeek.startDate]??readAListUsed(storage,selectedWeek.startDate);
  const currentUsed=usedByWeek[todayWeek.startDate]??readAListUsed(storage,todayWeek.startDate);
  const counts=Array.from({length:3},(_,i)=>{
    const weekStart=resolveAListCreditWeek(now,i===0?0:i===1?1:0).startDate;
    const start=i===2?new Date(Date.parse(todayWeek.startDate+'T12:00:00Z')+14*86400000).toISOString().slice(0,10):weekStart;
    return A_LIST_WEEKLY_ALLOWANCE-(usedByWeek[start]??readAListUsed(storage,start));
  });
  const report=useMemo(()=>buildAListRecommendations({
    homeData,catalog:signals?.catalog,comingSoon:signals?.comingSoon,shadow:signals?.shadow,
    storage,now,weekOffset,creditsByWeek:counts,priorityIds,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }),[homeData,signals,storage,now,weekOffset,priorityIds,revision,...counts]);
  function changeUsed(n){
    const val=Math.max(0,Math.min(4,n));
    if(!writeAListUsed(storage,selectedWeek.startDate,val)){
      setError('Could not save the credit count on this device.');return;
    }
    setUsedByWeek(prev=>({...prev,[selectedWeek.startDate]:val}));
    setError('');
  }
  function toggleMustSee(id){
    const next=priorityIds.includes(id)?priorityIds.filter(x=>x!==id):[...priorityIds,id];
    try{
      if(!storage)throw new Error('Storage unavailable');
      storage.setItem(PRIORITY_KEY,JSON.stringify(next));
      setPriorityIds(next);setError('');
    }catch{setError('Could not store your must-see selection on this device.');}
  }
  const window=report.week;
  const top=report.top||[];
  const spare=report.alternatives||[];
  const premieres=report.thursdayPremieres||[];
  const selectedDemand=report.demand?.[weekOffset];
  const upcomingDemand=report.demand?.[weekOffset+1];
  return (
    <section className="v2-alist" aria-label="Experimental A-List weekly report">
      <button type="button" className="v2-alist-toggle" aria-expanded={expanded}
        onClick={()=>{setNow(new Date());setExpanded(x=>!x);}}>
        <span className="v2-alist-teaser">
          <span className="v2-alist-eyebrow">EXPERIMENTAL · AMC</span>
          <strong>Your A-List week</strong>
          <span className="v2-alist-teaser-caption">Which movies to watch now, and which can wait</span>
        </span>
        <span className="v2-alist-count">{4-currentUsed} / 4 left <span aria-hidden="true">{expanded?'−':'+'}</span></span>
      </button>
      {expanded?(
        <div className="v2-alist-content">
          <div className="v2-alist-week-switch" role="group" aria-label="Select A-List credit week">
            <button type="button" aria-pressed={weekOffset===0} onClick={()=>setWeekOffset(0)}>This week</button>
            <button type="button" aria-pressed={weekOffset===1} onClick={()=>setWeekOffset(1)}>Next week</button>
          </div>
          <div className="v2-alist-week">
            <strong>Fri {dateLabel(window.startDate)} – Thu {dateLabel(window.lastDate)}</strong>
            <span>Resets Friday at 6 AM PT</span>
          </div>
          <div className="v2-alist-credits">
            <div><strong>{4-selectedUsed} of 4 credits remaining</strong>
              <p>Manually tracked, separate for each week.</p>
            </div>
            <div className="v2-alist-stepper">
              <button type="button" disabled={selectedUsed===0}
                onClick={()=>changeUsed(selectedUsed-1)} aria-label="Decrease credits used">−</button>
              <output aria-label="Credits used">{selectedUsed} used</output>
              <button type="button" disabled={selectedUsed===4}
                onClick={()=>changeUsed(selectedUsed+1)} aria-label="Increase credits used">+</button>
            </div>
          </div>
          {error?<p role="status" className="v2-alist-error">{error}</p>:null}
          {loadStatus==='loading'?<p role="status" className="v2-alist-empty">Loading eligibility and upcoming releases…</p>:null}
          {loadStatus==='unavailable'||(loadStatus==='ready'&&report.status!=='ready')?
            <p role="status" className="v2-alist-empty">A-List eligibility data isn't available. Recommendations are hidden rather than including potentially ineligible films.</p>:null}
          {loadStatus==='ready'&&report.status==='ready'?(
            <>
              <div className="v2-alist-demand">
                <strong>{weekOffset===1?'Next week outlook':'Looking ahead'}</strong>
                <p>{upcomingDemand
                  ? `Following credit week: ${upcomingDemand.confirmed} locally announced, ${upcomingDemand.anticipated} other anticipated AMC releases. These are estimates, not confirmed Seattle screenings.`
                  : 'Upcoming AMC scheduling data is incomplete.'}</p>
              </div>
              <div className="v2-alist-section">
                <h3>Top {Math.min(top.length,6)} to consider</h3>
                <p className="v2-alist-section-detail">Six choices, not a requirement to use every credit. Film availability and future-week pressure both matter.</p>
                {top.length?<ol className="v2-alist-list">{top.map((row,i)=>
                  <FilmRow key={row.identity} row={row} number={i+1}
                    onOpenFilmDetail={onOpenFilmDetail} onToggleMustSee={toggleMustSee}/>)}</ol>
                  :<p className="v2-alist-empty">No confirmed, A-List-eligible film showtimes in this week yet.</p>}
                {report.forecastStatus==='unavailable'&&top.length?
                  <p className="v2-alist-footnote">Predicted leaving dates are unavailable until the research forecast is refreshed and matches this credit week. Confirmed later showtimes are marked above.</p>:null}
              </div>
              {premieres.length?(
                <details className="v2-alist-more">
                  <summary>Thursday openings · Better next week ({premieres.length})</summary>
                  <p className="v2-alist-section-detail">These open at the end of this credit week; save them for Friday's new credits unless you prefer a preview.</p>
                  <ul className="v2-alist-list">{premieres.map(row=>
                    <FilmRow key={row.identity} row={row}
                      onOpenFilmDetail={onOpenFilmDetail} onToggleMustSee={toggleMustSee}/>)}</ul>
                </details>
              ):null}
              {spare.length?(
                <details className="v2-alist-more">
                  <summary>Other eligible AMC films ({spare.length})</summary>
                  <ul className="v2-alist-list">{spare.slice(0,12).map(row=>
                    <FilmRow key={row.identity} row={row}
                      onOpenFilmDetail={onOpenFilmDetail} onToggleMustSee={toggleMustSee}/>)}</ul>
                  {spare.length>12?<p className="v2-alist-footnote">Showing the first 12 alternatives.</p>:null}
                </details>
              ):null}
              <p className="v2-alist-disclaimer">
                Experimental recommendation order, not a validated measure of film quality.
                Only AMC products explicitly flagged eligible are shown; screening-level
                exceptions may still apply. Missing future showtimes do not establish a final date.
                Predictions, when shown, estimate programming weeks rather than exact final screenings.
              </p>
            </>
          ):null}
        </div>
      ):null}
    </section>
  );
}
