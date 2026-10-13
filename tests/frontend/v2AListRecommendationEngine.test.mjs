import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEligibilityIndex,
  buildAListRecommendations,
} from '../../v2/planner/aListRecommendationEngine.js';
import { saveFilm } from '../../v2/stores/savedFilmsStore.js';
import { markFilmSeen } from '../../v2/stores/seenFilmsStore.js';
import { markFilmNotInterested } from '../../v2/stores/notInterestedFilmsStore.js';

const now=new Date('2026-10-12T21:13:00-07:00');
function store(){
  const values=new Map();
  return {getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,v)=>values.set(key,String(v)),removeItem:key=>values.delete(key)};
}
const catalog={schema_version:1,products:[
  {amc_movie_id:'1',a_list_eligible:true,release_date:'2026-10-16',presentation_kind:'standard'},
  {amc_movie_id:'2',a_list_eligible:true,release_date:'2026-10-23',presentation_kind:'standard'},
  {amc_movie_id:'3',a_list_eligible:false,release_date:'2026-10-17',presentation_kind:'concert_or_event'},
  {amc_movie_id:'4',a_list_eligible:true,release_date:'2026-10-19',presentation_kind:'concert_or_event'},
  {amc_movie_id:'5',a_list_eligible:true,release_date:'2026-09-25',presentation_kind:'standard'},
  {amc_movie_id:'6',a_list_eligible:true,release_date:'2026-10-16',presentation_kind:'standard'},
  {amc_movie_id:'7',a_list_eligible:true,release_date:'2026-10-16',presentation_kind:'mystery_screening'},
]};
const titles={'1':'The Devils','2':'Wildwood','3':'Spirited Away','4':'Fan First Event',
  '5':'Small Indie','6':'Street Fighter','7':'AMC'};
const filmId={'1':'tmdb:1001','2':'tmdb:1002','3':'tmdb:1003','4':'tmdb:1004',
  '5':'tmdb:1005','6':'tmdb:1006','7':'tmdb:1007'};
function opp(id,date,time='18:00',extra={}){
  return {filmKey:'film-'+id,sourceFilmId:id,source:'amc',theaterId:'amc-pacific-place',
    localDate:date,localTime:time,status:'available',opportunityKey:id+date+time,
    ...extra};
}
function home(){
  return {films:Object.keys(titles).map(id=>({filmKey:'film-'+id,filmId:filmId[id],title:titles[id]})),
    opportunities:[
      opp('1','2026-10-17'),opp('1','2026-10-20'),
      opp('2','2026-10-22','14:00'),opp('2','2026-10-23','14:00'),
      opp('3','2026-10-14'),opp('3','2026-10-17'),
      opp('4','2026-10-19'),
      opp('5','2026-10-18'),opp('5','2026-10-19'),
      opp('6','2026-10-16','20:00'),opp('6','2026-10-23','20:00'),
      opp('7','2026-10-17'),
    ]};
}
test('explicit eligibility is required and film list excludes ineligible, unknown, mystery titles',()=>{
  const r=buildAListRecommendations({homeData:home(),catalog,now,weekOffset:1});
  const ids=[...r.top,...r.alternatives,...r.thursdayPremieres].map(x=>x.filmId);
  assert.equal(r.status,'ready');
  assert.equal(ids.includes('tmdb:1003'),false);
  assert.equal(ids.includes('tmdb:1007'),false);
  // Coverage counts both Oct 14 and Oct 17 ineligible opportunities
  // across the entire three-week planning horizon, not only selected week.
  assert.equal(r.coverage.excluded,2);
  assert.equal(r.thursdayPremieres.length,1);
  assert.equal(r.thursdayPremieres[0].title,'Wildwood');
  const missing=buildAListRecommendations({homeData:home(),now});
  assert.equal(missing.status,'eligibility_unavailable');
  assert.equal(missing.top.length,0);
});
test('Thursday premiere defers to Friday, first week regular films take top slots',()=>{
  const r=buildAListRecommendations({homeData:home(),catalog,now,weekOffset:1});
  assert.equal(r.week.startDate,'2026-10-16');
  assert.equal(r.week.endDate,'2026-10-23');
  assert.deepEqual(r.thursdayPremieres.map(x=>x.title),['Wildwood']);
  assert.equal(r.top.some(x=>x.title==='Wildwood'),false);
  assert.equal(r.top.some(x=>x.title==='The Devils'),true);
  const after=buildAListRecommendations({homeData:home(),catalog,now,weekOffset:0});
  assert.equal(after.top.some(x=>x.title==='The Devils'),false);
});
test('future release pressure uses A-List-eligible AMC calendar entries and excludes noneligible',()=>{
  const comingSoon={entries:[
    {join_key:'future-eligible',amc_movie_id:'2',expected_release_date:'2026-10-23',
      relevance_tier:'confirmed_local',local_status:'confirmed',title:'Wildwood'},
    {join_key:'false',amc_movie_id:'3',expected_release_date:'2026-10-23',
      relevance_tier:'confirmed_local',title:'Spirited Away'},
    {join_key:'unknown',amc_movie_id:'99999',expected_release_date:'2026-10-23',
      relevance_tier:'confirmed_local',title:'Unknown'},
  ]};
  const r=buildAListRecommendations({homeData:home(),catalog,comingSoon,now,weekOffset:1});
  assert.equal(r.demand[2].confirmed,1);
  assert.equal(r.demand[2].anticipated,0);
  assert.equal(r.allocations.length,3);
  assert.equal(r.allocations.every(x=>x.allocations.length<=4),true);
});
test('preferences remove Seen/Not Interested, and must-see strengthens priority',()=>{
  const storage=store();
  saveFilm(storage,{filmId:'tmdb:1005',showtimeFilmKey:'film-5'});
  markFilmSeen(storage,{filmId:'tmdb:1001',showtimeFilmKey:'film-1'});
  markFilmNotInterested(storage,{filmId:'tmdb:1004',showtimeFilmKey:'film-4'});
  const r=buildAListRecommendations({homeData:home(),catalog,now,weekOffset:1,storage,
    priorityIds:['tmdb:1006']});
  const all=[...r.top,...r.alternatives,...r.thursdayPremieres];
  assert.equal(all.some(x=>x.title==='The Devils'),false);
  assert.equal(all.some(x=>x.title==='Fan First Event'),false);
  assert.equal(r.top.some(x=>x.title==='Street Fighter'&&x.mustSee),true);
});
test('stale shadow is suppressed; fresh aligned market forecast yields week range',()=>{
  const shadow={modelVersion:'remaining_run_shadow_v1',asOf:'2026-10-12',
    market:[{sourceFilmId:'1',currentProgrammingWeek:'2026-10-09',
      forecastState:'post_publication',pFinalWeek:0.72,pPlus1Week:0.2,
      pPlus2Weeks:0.05,pPlus3PlusWeeks:0.03}]};
  const current=buildAListRecommendations({homeData:home(),catalog,now,shadow,weekOffset:0});
  assert.equal(current.forecastStatus,'unavailable');
  const future=buildAListRecommendations({homeData:home(),catalog,now,shadow,weekOffset:1});
  assert.equal(future.top.some(x=>x.predictedLeaving),false);
  const altered=home();
  altered.opportunities.push(opp('1','2026-10-14','20:00'));
  const fresh=buildAListRecommendations({homeData:altered,catalog,now,shadow,weekOffset:0});
  const devils=fresh.top.find(x=>x.title==='The Devils');
  assert.ok(devils?.predictedLeaving);
  assert.equal(devils.predictedLeaving.startDate,'2026-10-09');
  const stale=buildAListRecommendations({homeData:altered,catalog,now,
    shadow:{...shadow,asOf:'2026-10-01'}});
  assert.equal(stale.top.some(x=>x.predictedLeaving),false);
});
test('triple-week assignment never exceeds allowance or allocates one film twice',()=>{
  const result=buildAListRecommendations({homeData:home(),catalog,now,creditsByWeek:[1,2,4]});
  assert.deepEqual(result.allocations.map(x=>x.capacity),[1,2,4]);
  const filmIds=result.allocations.flatMap(x=>x.allocations);
  assert.equal(filmIds.length,new Set(filmIds).size);
  assert.equal(result.allocations.every(x=>x.allocations.length<=x.capacity),true);
});
