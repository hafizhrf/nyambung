import {expect,it} from 'vitest';
import {trainDifficulty,predictDifficulty} from '../apps/api/src/adaptive.js';
import {roundFeatures,type RetrievalContext} from '../apps/api/src/retrieval.js';
import {selectRounds,evaluateRound,reviewedAnswers,type RandomGenerator} from '../apps/api/src/random-generator.js';
import {reviewedBridges} from '../content/relations.js';
import {openDatabase} from '../apps/api/src/db.js';
import {game} from '../apps/api/src/game.js';
import {compileRandomPool,publishRandomPool,requalifyPublishedRandomPool} from '../scripts/content.js';
function fixture():RandomGenerator {
 const clues=[...new Set(reviewedBridges.flatMap(r=>r.facets.flat()))];
 const words=[...new Set([...clues,...reviewedBridges.map(r=>r.answer)])];
 return {version:3,words,answers:words,relations:reviewedBridges,excludedCombos:[],profiles:clues.map((word,j)=>({word,baseline:0,reference:1,similarities:words.map((_,i)=>.05+(i+j)%15/100)}))};
}
function rng(seed=17) {return (limit:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*limit);};}
it('learns expected difficulty from outcomes, weights personal history, and tolerates cold start',()=>{
 const features=[1,0,.2,.1,.1,.1,.2,.4],prior=trainDifficulty([]);
 const high=trainDifficulty(Array.from({length:40},()=>({features,outcome:.95})));
 const low=trainDifficulty(Array.from({length:40},()=>({features,outcome:.1})));
 expect(predictDifficulty(high,features)).toBeGreaterThan(predictDifficulty(prior,features));
 expect(predictDifficulty(low,features)).toBeLessThan(predictDifficulty(prior,features));
 const personal=trainDifficulty([...Array.from({length:20},()=>({features,outcome:.1})),...Array.from({length:20},()=>({features,outcome:.95,weight:3}))]);
 expect(predictDifficulty(personal,features)).toBeGreaterThan(.6);
 expect(trainDifficulty([{features:[NaN],outcome:1}])).toEqual(prior);
 expect(high.samples).toBe(40);
});
it('retrieves forty different answer hubs in ten games and avoids known answers and clue patterns',()=>{
 const data=fixture(),pick=rng(),excluded=new Set<string>();
 data.relations=data.relations!.map((relation,i)=>({...relation,sense:`test-sense-${Math.floor(i/2)}`}));
 const seenConcepts=new Set<string>();
 const context:RetrievalContext={exposures:['nada','koper','akar','jembatan','resep'].map(best=>({best,clues:[]})),model:trainDifficulty([])};
 const seen=new Set<string>();
 for(let i=0;i<10;i++) {
  const {selection,stages}=selectRounds(data,pick,excluded,context);
  expect(selection.policy?.version).toBe('retrieval-ridge-v1');
  stages.forEach((stage,index)=>{
   const concept=data.relations!.find(relation=>relation.answer===stage.best)!.sense!;
   expect(seenConcepts.has(concept)).toBe(false);seenConcepts.add(concept);
   expect(seen.has(stage.best)).toBe(false);expect(['nada','koper','akar','jembatan','resep']).not.toContain(stage.best);
   expect(reviewedAnswers(data,stage.clues)).toContain(stage.best);
   expect(stage.scores[stage.best].score).toBe(1000);
   expect(evaluateRound(data,selection.rounds[index])).toEqual(stage);
   expect(selection.rounds[index].features).toHaveLength(8);
   seen.add(stage.best);context.exposures.unshift({best:stage.best,clues:stage.clues});excluded.add([...stage.clues].sort().join('|'));
  });
 }
 expect(seen.size).toBe(40);expect(excluded.size).toBe(40);
 expect(evaluateRound(data,{kind:'bridge2',clues:['air','kantor'],target:'nada'})).toBeNull();
 expect(roundFeatures(data,{kind:'bridge2',clues:['tidaktersedia','kantor']},'galon')).toBeNull();
});
it('trains future selections from persisted gameplay, counts retries once, and freezes active runs',()=>{
 const store=openDatabase(':memory:');
 try {
  const snapshot=compileRandomPool(store,true);snapshot.generator=fixture();snapshot.stages=snapshot.stages.filter(s=>s.kind==='closest');
  publishRandomPool(store,snapshot,true);
  let service=game(store);const player=service.createPlayer();
  let run=service.startRandom(player);const id=run.id;
  const descriptor=(id:string)=>JSON.parse((store.sqlite.prepare('SELECT stage_order FROM runs WHERE id=?').get(id) as {stage_order:string}).stage_order);
  const selection=descriptor(id);
  expect(selection.policy.samples).toBe(0);
  for(let stage=0;stage<4;stage++) {
   const answer=selection.rounds[stage].target;
   run=service.submit(id,player,{stage,word:answer});
   expect(service.submit(id,player,{stage,skip:true})).toEqual(run);
  }
  run=service.submit(id,player,{stage:4,skip:true});
  const saved=run;
  service=game(store);
  const next=service.startRandom(player);
  expect(descriptor(next.id).policy.samples).toBe(4);
  expect(descriptor(next.id).policy.weights).not.toEqual(selection.policy.weights);
  expect(service.view(id,player)).toEqual(saved);
  expect(service.startRandom(player)).toEqual(next);
  const stranger=service.createPlayer();const other=service.startRandom(stranger);
  expect(descriptor(other.id).policy.samples).toBe(4);
  expect(JSON.stringify(other)).not.toContain('weights');
  expect(JSON.stringify(other)).not.toContain('target');
 } finally {store.sqlite.close();}
});

it('samples more than six clue sets per answer instead of staying in a fixed shortlist',()=>{
 const data=fixture(),combinations=new Set<string>();
 const exposures=data.relations!.filter(relation=>relation.answer!=='galon').map(relation=>({best:relation.answer,clues:[]}));
 for(let seed=1;seed<=48;seed++) {
  const {stages}=selectRounds(data,rng(seed*7919),new Set(),{exposures,model:trainDifficulty([])});
  expect(stages[0].best).toBe('galon');
  combinations.add([...stages[0].clues].sort().join('|'));
 }
 expect(combinations.size).toBeGreaterThan(6);
});
it('avoids reusing a previous pair inside either a two- or three-clue round',()=>{
 const data=fixture(),pick=rng(91),context:RetrievalContext={exposures:[],model:trainDifficulty([])},pairs=new Set<string>();
 for(let i=0;i<8;i++) {
  const {stages}=selectRounds(data,pick,new Set(),context);
  for(const stage of stages) {
   stage.clues.forEach((clue,index)=>stage.clues.slice(index+1).forEach(other=>{
    const pair=[clue,other].sort().join('|');expect(pairs.has(pair)).toBe(false);pairs.add(pair);
   }));
   context.exposures.unshift({best:stage.best,clues:stage.clues});
  }
 }
});
it('matches distinct reviewed roles when a clue belongs to more than one facet',()=>{
 const data=fixture();data.facetPolicy='distinct-roles-v1';data.relations=[{answer:'kunci',facets:[['pintu','musik'],['pintu'],['jawaban']]}];
 expect(reviewedAnswers(data,['pintu','musik'])).toEqual(['kunci']);
 expect(reviewedAnswers(data,['pintu','musik','jawaban'])).toEqual(['kunci']);
 expect(reviewedAnswers(data,['musik','nada'])).toEqual([]);
 expect(reviewedAnswers({...data,facetPolicy:undefined},['pintu','musik'])).toEqual([]);
});

it('expands an existing bank while retaining legacy lexical senses and frozen snapshots',()=>{
 const store=openDatabase(':memory:');
 try {
  const snapshot=compileRandomPool(store,true),data=fixture();
  const legacy={answer:'kunci',facets:[['pintu'],['musik']],source:'wordnet-bahasa',sense:'legacy-key'};
  data.relations=[...data.relations!.slice(0,10),legacy];snapshot.generator=data;
  publishRandomPool(store,snapshot,true);
  const before=store.sqlite.prepare('SELECT snapshot FROM puzzle_versions').all();
  const revised=requalifyPublishedRandomPool(store);
  expect(revised.generator!.relations!.length).toBeGreaterThan(data.relations.length);
  expect(revised.generator!.relations).toContainEqual(legacy);
  expect(revised.generator!.relations!.some(relation=>relation.answer==='motif')).toBe(true);
  expect(store.sqlite.prepare('SELECT snapshot FROM puzzle_versions').all()).toEqual(before);
  publishRandomPool(store,revised,true);
  expect(requalifyPublishedRandomPool(store)).toEqual(revised);
 } finally {store.sqlite.close();}
});
