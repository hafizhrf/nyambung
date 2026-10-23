import {expect,it} from 'vitest';
import {packVectors,semanticSimilarity,profileFor,evaluateClosest} from '../apps/api/src/vector-index.js';
import {evaluateRound,selectRounds,type RandomGenerator} from '../apps/api/src/random-generator.js';
import {reviewedBridges} from '../content/relations.js';
import {openDatabase} from '../apps/api/src/db.js';
import {game} from '../apps/api/src/game.js';
import {compileRandomPool,publishRandomPool} from '../scripts/content.js';
function fixture():RandomGenerator {
 const words=[...new Set([...reviewedBridges.flatMap(r=>[r.answer,...r.facets.flat()]),'gelap','kelam','terang'])];
 // Distinct directions let this storage fixture pass the cross-context gate.
 const vectors=new Map(words.map((word,i)=>[word,Array.from({length:words.length},(_,j)=>i===j?1:0)]));
 return {version:4,packed:packVectors(words,vectors),words,answers:reviewedBridges.map(r=>r.answer),profiles:[],relations:reviewedBridges,excludedCombos:[]};
}
it('stores vectors compactly, preserves cosine within quantization error and rejects incomplete indices',()=>{
 const words=['a','b','c'],vectors=new Map([['a',[1,2,3]],['b',[3,2,1]],['c',[-1,-2,-3]]]);
 const data:RandomGenerator={version:4,words,answers:[],relations:[],profiles:[],excludedCombos:[],packed:packVectors(words,vectors)};
 expect(Buffer.from(data.packed!.data,'base64').length).toBe(9);
 expect(semanticSimilarity(data,'a','b')).toBeCloseTo(10/14,2);
 expect(semanticSimilarity(data,'a','c')).toBeCloseTo(-1,5);
 expect(semanticSimilarity(data,'a','a')).toBeCloseTo(1,5);
 expect(semanticSimilarity(data,'absent','a')).toBe(0);
 expect(profileFor(data,'a')!.similarities).toHaveLength(3);
 expect(()=>semanticSimilarity({...data,packed:{...data.packed!,data:''}},'a','b')).toThrow('Ukuran indeks');
});
it('reconstructs scores from a published packed index without dense profiles or an embedding API',()=>{
 const data=fixture(),result=selectRounds(data,limit=>Math.floor(limit/2));
 expect(data.profiles).toEqual([]);
 for(let i=0;i<4;i++) {
  const restored=evaluateRound(JSON.parse(JSON.stringify(data)),result.selection.rounds[i]);
  expect(restored).toEqual(result.stages[i]);expect(restored!.scores[restored!.best].score).toBe(1000);
 }
});
it('lazily scores the final stage and preserves progress across editions, restarts and retries',()=>{
 const store=openDatabase(':memory:');
 try {
  const snapshot=compileRandomPool(store,true);snapshot.generator=fixture();
  const closest={kind:'closest' as const,clues:['gelap'],best:'kelam',explanation:'',overrides:{},excluded:['terang'],scores:{}};
  snapshot.stages=[closest];publishRandomPool(store,snapshot,true);
  let service=game(store);const player=service.createPlayer();let run=service.startRandom(player);
  for(let stage=0;stage<4;stage++) run=service.submit(run.id,player,{stage,skip:true});
  expect(run.current!.clues).toEqual(['gelap']);
  run=service.submit(run.id,player,{stage:4,word:'kelam'});
  expect(run.results[4].score).toBe(1000);
  service=game(store);expect(service.view(run.id,player)).toEqual(run);
  expect(service.submit(run.id,player,{stage:4,skip:true})).toEqual(run);
  const scored=evaluateClosest(snapshot.generator!,closest);
  expect(scored.scores.terang.score).toBe(0);expect(scored.scores.kelam.rank).toBe(1);
 } finally {store.sqlite.close();}
});
