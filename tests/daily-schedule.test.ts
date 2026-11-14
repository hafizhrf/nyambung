import {expect,it} from 'vitest';
import {compileSchedule,publishSchedule,reserveDailyContent} from '../scripts/daily-schedule.js';
import {yearEndPuzzles,yearEndStart,yearEndEnd} from '../content/daily-year-end.js';
import {reviewedBridges} from '../content/relations.js';
import {openDatabase} from '../apps/api/src/db.js';
import {game} from '../apps/api/src/game.js';
import {packVectors} from '../apps/api/src/vector-index.js';
import {fingerprint,type Snapshot} from '../apps/api/src/scoring.js';
import {combinationKey} from '../apps/api/src/random-generator.js';
import {addDays} from '../apps/api/src/time.js';
function fixture(){
  const days=yearEndPuzzles.slice(0,2);
  const targets=new Set(days.flat().filter(stage=>stage.kind!=='closest').map(stage=>stage.best));
  const relations=reviewedBridges.filter(row=>targets.has(row.answer));
  const words=[...new Set([...relations.flatMap(row=>[row.answer,...row.facets.flat()]),...days.flatMap(day=>day.flatMap(stage=>[stage.best,...stage.clues])),'sepi','senyap','letih','lelah','penat','capek'])];
  const vectors=new Map(words.map((word,i)=>[word,words.map((_,j)=>i===j?1:0)]));
  const source:Snapshot={version:1,model:'test-frozen-index',formula:'grounded-bridge-v1',vocabularyHash:fingerprint(words),aliases:{},blocked:[],generator:{version:4,words,answers:relations.map(row=>row.answer),relations,profiles:[],excludedCombos:[],scoringPolicy:{version:'grounded-bridge-v1',lexicalWords:words},packed:packVectors(words,vectors)},stages:[...days.map(day=>({...day[4],scores:{}})),{kind:'closest',clues:['letih'],best:'lelah',explanation:'Lelah berarti letih setelah berkegiatan.',overrides:{penat:[1],capek:[1]},scores:{}}]};
  return {days,source,ref:fingerprint(source)};
}
function seed(store:ReturnType<typeof openDatabase>,source:Snapshot,ref:string){
  store.sqlite.prepare('INSERT INTO puzzle_versions(id,snapshot,demo) VALUES (?,?,0)').run(ref,JSON.stringify(source));
  store.sqlite.prepare("INSERT INTO random_pool(id,version_id) VALUES ('active',?)").run(ref);
}
it('provides fifty-seven complete original days through December 31 with diverse answers',()=>{
  expect(yearEndPuzzles).toHaveLength(57);expect(addDays(yearEndStart,56)).toBe(yearEndEnd);
  expect(yearEndPuzzles.flat()).toHaveLength(285);
  expect(new Set(yearEndPuzzles.flat().filter(s=>s.kind!=='closest').map(s=>s.best)).size).toBe(228);
  expect(new Set(yearEndPuzzles.flat().map(s=>combinationKey(s.clues))).size).toBe(285);
});
it('publishes compact shared-index days, protects unopened clues, and replays them after random updates',()=>{
  const store=openDatabase(':memory:');
  try{
    const {days,source,ref}=fixture();seed(store,source,ref);
    const packets=compileSchedule(source,ref,days,yearEndStart);
    const reserved=reserveDailyContent(source,packets);
    expect(packets.every(packet=>Buffer.byteLength(packet.snapshot)<12000)).toBe(true);
    expect(JSON.parse(packets[0].snapshot).generator).toBeUndefined();
    const published=publishSchedule(store,packets,ref,reserved);
    expect(published.inserted).toBe(2);
    expect(publishSchedule(store,packets,ref,reserved).inserted).toBe(0);
    for(const stage of days.flat())expect(reserved.generator!.excludedCombos).toContain(combinationKey(stage.clues));
    expect(reserved.stages.map(stage=>stage.clues[0])).toEqual(['letih']);
    let now=new Date('2026-11-04T12:00:00+07:00'),service=game(store,()=>now);
    const player=service.createPlayer();expect(()=>service.start(player,'2026-11-05')).toThrow('belum tersedia');
    now=new Date('2026-11-05T00:00:00+07:00');let run=service.start(player);
    expect(run.number).toBe(15);expect(JSON.stringify(run)).not.toMatch(/scoringRef|grounded|galon/);
    run=service.submit(run.id,player,{stage:0,word:days[0][0].best});
    expect(run.results[0].score).toBe(1000);expect(run.results[0].explanation).toBe(days[0][0].explanation);
    const saved=run;
    const unrelated={...source,formula:'later-random-edition'};const newRef=fingerprint(unrelated);
    store.sqlite.prepare('INSERT INTO puzzle_versions(id,snapshot,demo) VALUES (?,?,0)').run(newRef,JSON.stringify(unrelated));
    store.sqlite.prepare("UPDATE random_pool SET version_id=? WHERE id='active'").run(newRef);
    service=game(store,()=>now);expect(service.start(player)).toEqual(saved);
    expect(service.submit(run.id,player,{stage:0,skip:true})).toEqual(saved);
    for(let stage=1;stage<4;stage++)run=service.submit(run.id,player,{stage,word:days[0][stage].best});
    run=service.submit(run.id,player,{stage:4,word:'senyap'});
    expect(run.completed).toBe(true);expect(run.total).toBe(5000);
    expect(service.topAnswers(run.id,player,4)).toMatchObject({referenceOnly:true,answers:expect.arrayContaining([{word:'senyap',score:1000}])});
    service=game(store,()=>now);expect(service.view(run.id,player)).toEqual(run);
  }finally{store.sqlite.close();}
});
it('rejects a conflicting published day before inserting any new day or changing the random bank',()=>{
  const store=openDatabase(':memory:');
  try{
    const {days,source,ref}=fixture();seed(store,source,ref);
    const packets=compileSchedule(source,ref,days,yearEndStart),reserved=reserveDailyContent(source,packets);
    store.sqlite.prepare('INSERT INTO daily(date,number,demo,snapshot,published_at) VALUES (?,99,0,?,?)').run(packets[1].date,'{"original":true}','original');
    const before=store.sqlite.prepare('SELECT * FROM daily').all();
    expect(()=>publishSchedule(store,packets,ref,reserved)).toThrow('konten lain');
    expect(store.sqlite.prepare('SELECT * FROM daily').all()).toEqual(before);
    expect(store.sqlite.prepare("SELECT version_id FROM random_pool WHERE id='active'").get()).toEqual({version_id:ref});
    expect(store.sqlite.prepare('SELECT COUNT(*) n FROM puzzle_versions').get()).toEqual({n:1});
  }finally{store.sqlite.close();}
});
it('rejects repeated clues, unknown words, and a changed scoring reference during review',()=>{
  const {days,source,ref}=fixture();
  expect(()=>compileSchedule(source,'0'.repeat(64),days,yearEndStart)).toThrow('Indeks skor');
  expect(()=>compileSchedule(source,ref,days,yearEndStart,new Set([combinationKey(days[0][0].clues)]))).toThrow('pernah dijadwalkan');
  const invalid=structuredClone(days);invalid[0][1].clues[0]=invalid[0][0].clues[0];invalid[0][2].best='katayangtidakada';
  expect(()=>compileSchedule(source,ref,invalid,yearEndStart)).toThrow('petunjuk berulang');
});
