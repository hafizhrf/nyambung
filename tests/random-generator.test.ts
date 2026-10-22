import { expect, it } from 'vitest';
import { evaluateRound, selectRounds, combinationKey, type RandomGenerator } from '../apps/api/src/random-generator.js';
import { openDatabase } from '../apps/api/src/db.js';
import { game } from '../apps/api/src/game.js';
import { compileRandomPool, publishRandomPool } from '../scripts/content.js';
function fixture():RandomGenerator {
  const clues=Array.from('abcdefghijklmnop',letter=>`kata${letter}`);
  const words=[...clues,'jawab','alternatif','pilihan','asing'];
  return {version:1,words,answers:['jawab','alternatif','pilihan'],excludedCombos:[],profiles:clues.map((word,index)=>({word,baseline:0,reference:1,similarities:[...clues.map((_,i)=>i===index?1:.02),.5-index*.001,.49-index*.001,.48-index*.001,.01]}))};
}
function rng(seed=17) { return (limit:number) => { seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*limit); }; }
it('builds new combinations, avoids recent rounds and reconstructs identical scores',()=>{
  const data=fixture();
  const first=selectRounds(data,rng());
  expect(first.selection.rounds.map(round=>round.kind)).toEqual(['bridge2','bridge2','bridge2','bridge3']);
  expect(new Set(first.selection.rounds.flatMap(round=>round.clues)).size).toBe(9);
  const history=new Set(first.selection.rounds.map(round=>combinationKey(round.clues)));
  const second=selectRounds(data,rng(123),history);
  expect(second.selection.rounds.every(round=>!history.has(combinationKey(round.clues)))).toBe(true);
  first.selection.rounds.forEach((round,index)=>{
    const recovered=evaluateRound(data,JSON.parse(JSON.stringify(round)))!;
    expect(recovered).toEqual(first.stages[index]);
    expect(recovered.scores.jawab.score).toBe(1000);
    expect(recovered.scores.asing.score).toBeLessThan(recovered.scores.pilihan.score);
    expect(recovered.scores.jawab.connections.some(value=>value<1)).toBe(true);
    expect(Object.values(recovered.scores).every(value=>value.score>=0&&value.score<=1000)).toBe(true);
  });
});
it('rejects closely related clues and combinations with only one plausible candidate',()=>{
  const data=fixture();
  data.profiles[0].similarities[1]=.18;
  expect(evaluateRound(data,{kind:'bridge2',clues:['kataa','katab']},true)).toBeNull();
  const narrow=fixture();
  narrow.answers=['jawab'];
  expect(evaluateRound(narrow,{kind:'bridge3',clues:['kataa','katab','katac']},true)).toBeNull();
});
it('pins generated selections through restarts, updates and retries without exposing answers',()=>{
  const store=openDatabase(':memory:');
  try {
    const snapshot=compileRandomPool(store,true);
    snapshot.generator=fixture(); snapshot.formula='random-profile-harmonic-relative-v1';
    // Curated fifth rounds remain independently reviewed synonyms.
    snapshot.stages=snapshot.stages.filter(stage=>stage.kind==='closest');
    publishRandomPool(store,snapshot,true);
    let service=game(store); const player=service.createPlayer();
    const initial=service.startRandom(player);
    expect(JSON.stringify(initial)).not.toContain('jawab');
    expect(service.startRandom(player)).toEqual(initial);
    const first=service.submit(initial.id,player,{stage:0,word:'jawab'});
    expect(first.total).toBe(1000);
    expect(first.results[0].connections.some(value=>value<1)).toBe(true);
    publishRandomPool(store,compileRandomPool(store,true),true);
    service=game(store); // Empty caches after restart.
    expect(service.view(initial.id,player)).toEqual(first);
    expect(service.submit(initial.id,player,{stage:0,skip:true})).toEqual(first);
    for(let stage=1;stage<5;stage++) service.submit(initial.id,player,{stage,skip:true});
    expect(service.view(initial.id,player).completed).toBe(true);
    expect(service.stats(player).completed).toBe(0);
  } finally {store.sqlite.close();}
});

import { reviewedBridges } from '../content/relations.js';
import { vocabulary } from '../content/puzzles.js';
import { reviewedAnswers } from '../apps/api/src/random-generator.js';
function curatedFixture():RandomGenerator {
  const clues=[...new Set(reviewedBridges.flatMap(relation=>relation.facets.flat()))];
  const words=[...new Set([...clues,...reviewedBridges.map(relation=>relation.answer),'bandara','piano','asing'])];
  return {version:2,words,answers:words,relations:reviewedBridges,excludedCombos:[],profiles:clues.map(word=>({word,baseline:0,reference:1,similarities:words.map(candidate=>candidate==='bandara'?.99:.03)}))};
}
it('rejects unrelated bridges even if the embedding is confident, and honours reviewed alternatives',()=>{
  const data=curatedFixture();
  for(const clues of [['puisi','pesawat'],['bandara','kulit'],['panggung','roti','perak']]) {
    const stage=evaluateRound(data,{kind:clues.length===3?'bridge3':'bridge2',clues});
    if(clues[0]==='bandara') expect(stage?.best).toBe('koper');
    else expect(stage).toBeNull();
  }
  const stage=evaluateRound(data,{kind:'bridge2',clues:['air','kantor']})!;
  expect(stage.best).toBe('galon');
  expect(stage.scores.galon.score).toBe(1000);
  expect(stage.scores.bandara.score).toBeLessThan(950);
  expect(stage.scores.asing.score).toBeLessThan(200);
  expect(stage.explanation).toBe('');
});
it('varies reviewed combinations, keeps all clues explainable and avoids recent rounds',()=>{
  const data=curatedFixture(), history=new Set<string>();
  for(let i=0;i<15;i++) {
    const {selection,stages}=selectRounds(data,rng(i+1),history);
    expect(selection.rounds.map(round=>round.kind)).toEqual(['bridge2','bridge2','bridge2','bridge3']);
    selection.rounds.forEach((round,index)=>{
      expect(history.has(combinationKey(round.clues))).toBe(false);
      expect(reviewedAnswers(data,round.clues)).toContain(stages[index].best);
      expect(evaluateRound(JSON.parse(JSON.stringify(data)),round)).toEqual(stages[index]);
      history.add(combinationKey(round.clues));
    });
  }
  expect(history.size).toBe(60);
  for(const relation of reviewedBridges) {
    expect(relation.facets.length).toBeGreaterThanOrEqual(3);
    expect(relation.facets.flat()).not.toContain(relation.answer);
    for(const word of [relation.answer,...relation.facets.flat()]) expect(vocabulary).toContain(word);
  }
},15000);
it('rotates every synonym before repeating, for generated and legacy pools',()=>{
  const store=openDatabase(':memory:');
  try {
    const snapshot=compileRandomPool(store,true);
    const count=snapshot.stages.filter(stage=>stage.kind==='closest').length;
    expect(count).toBeGreaterThanOrEqual(12);
    for (const generated of [false,true]) {
      if(generated) {snapshot.generator=curatedFixture();snapshot.stages=snapshot.stages.filter(stage=>stage.kind==='closest');}
      publishRandomPool(store,snapshot,true);
      const service=game(store),player=service.createPlayer(),recent:string[]=[];
      for(let i=0;i<count+3;i++) {
        let run=service.startRandom(player);
        for(let stage=0;stage<4;stage++) run=service.submit(run.id,player,{stage,skip:true});
        const clue=run.current!.clues[0];
        expect(recent.slice(-(count-1))).not.toContain(clue);
        recent.push(clue);
        service.submit(run.id,player,{stage:4,skip:true});
      }
      expect(new Set(recent.slice(0,count)).size).toBe(count);
    }
  } finally {store.sqlite.close();}
});
it('uses old-edition final clues in the rotation while preserving the unfinished session',()=>{
  const store=openDatabase(':memory:');
  try {
    const old=compileRandomPool(store,true);
    old.stages=old.stages.filter(stage=>stage.kind!=='closest'||stage.clues[0]==='letih');
    publishRandomPool(store,old,true);
    const service=game(store),player=service.createPlayer();
    let run=service.startRandom(player);
    for(let stage=0;stage<4;stage++) run=service.submit(run.id,player,{stage,skip:true});
    expect(run.current!.clues).toEqual(['letih']);
    const next=compileRandomPool(store,true);
    next.generator=curatedFixture();next.stages=next.stages.filter(stage=>stage.kind==='closest').reverse();
    publishRandomPool(store,next,true);
    expect(service.startRandom(player)).toEqual(run);
    service.submit(run.id,player,{stage:4,skip:true});
    const seen=new Set(['letih']);
    for(let gameIndex=0;gameIndex<next.stages.length-1;gameIndex++) {
      run=service.startRandom(player);
      for(let stage=0;stage<4;stage++) run=service.submit(run.id,player,{stage,skip:true});
      const clue=run.current!.clues[0];expect(seen.has(clue)).toBe(false);seen.add(clue);
      service.submit(run.id,player,{stage:4,skip:true});
    }
    expect(seen.size).toBe(next.stages.length);
  } finally {store.sqlite.close();}
});
