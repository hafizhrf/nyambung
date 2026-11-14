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
    const restored=JSON.parse(JSON.stringify(data)) as RandomGenerator;
    selection.rounds.forEach((round,index)=>{
      expect(history.has(combinationKey(round.clues))).toBe(false);
      expect(reviewedAnswers(data,round.clues)).toContain(stages[index].best);
      expect(evaluateRound(restored,round)).toEqual(stages[index]);
      history.add(combinationKey(round.clues));
    });
  }
  expect(history.size).toBe(60);
  const wordSet=new Set(vocabulary);
  for(const relation of reviewedBridges) {
    expect(relation.facets.length).toBeGreaterThanOrEqual(3);
    expect(relation.facets.flat()).not.toContain(relation.answer);
    for(const word of [relation.answer,...relation.facets.flat()]) expect(wordSet.has(word)).toBe(true);
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

import {qualifyBridgeScoring} from '../scripts/bridge-scoring.js';
function noisyBridgeFixture():RandomGenerator {
  const words=['informasi','benih','sebar','sebarkan','menyebar','menyebarkan','disebar','disebarkan','tersebar','biji','bekalan','bungkalan','beritanya','beritakan','asing','bunga','berbunga'];
  return {version:3,words,answers:['sebar'],relations:[{answer:'sebar',facets:[['informasi'],['benih']]}],profiles:[
    {word:'informasi',baseline:-.05,reference:.4,similarities:words.map(word=>word==='informasi'?1:word==='biji'?.027:['bekalan','bungkalan'].includes(word)?.25:word.startsWith('berita')?.5:.07)},
    {word:'benih',baseline:-.05,reference:.4,similarities:words.map(word=>word==='benih'||word==='biji'?1:['bekalan','bungkalan'].includes(word)?.24:.095)},
  ],excludedCombos:[]};
}
it('ranks reviewed verb forms above noisy embedding neighbours and penalizes one-sided answers only in new editions',()=>{
  const old=noisyBridgeFixture(),round={kind:'bridge2' as const,clues:['informasi','benih'],target:'sebar'};
  const before=evaluateRound(old,round)!;
  const next=JSON.parse(JSON.stringify(old)) as RandomGenerator;
  qualifyBridgeScoring(next);
  const after=evaluateRound(next,round)!;
  expect(after.best).toBe('sebar');
  expect(after.scores.sebar.score).toBe(1000);
  for(const word of ['sebarkan','menyebar','menyebarkan','disebar','disebarkan','tersebar']) {
    expect(after.scores[word].score).toBe(980);
    expect(reviewedAnswers(next,round.clues)).toContain(word);
  }
  for(const word of ['bekalan','bungkalan','beritanya','beritakan']) {
    expect(before.scores[word].score).toBeGreaterThan(600);
    expect(after.scores[word].score).toBeLessThan(400);
    // Lower confidence never makes a known dictionary entry unplayable.
    expect(after.scores[word].score).toBeGreaterThan(0);
  }
  expect(after.scores.biji.connections[0]).toBeLessThan(.1);
  expect(after.scores.biji.connections[1]).toBe(1);
  expect(after.scores.biji.score).toBeLessThan(200);
  expect(after.scores.berbunga.score).toBeLessThan(980);
  expect(evaluateRound(old,round)).toEqual(before);
  expect(evaluateRound(JSON.parse(JSON.stringify(next)),round)).toEqual(after);
  expect(Object.values(after.scores).every(entry=>entry.score>=0&&entry.score<=1000)).toBe(true);
  expect(after.scores.sebar.rank).toBe(1);
  expect(after.scores.menyebar.rank).toBe(2);
});
it('qualifies forms only within editorial evidence and never promotes them for unrelated clues or senses',()=>{
  const data=noisyBridgeFixture();
  data.relations!.push({answer:'bunga',facets:[['taman'],['bank']],source:'wordnet-bahasa',sense:'other'});
  const original=JSON.stringify(data.relations);
  qualifyBridgeScoring(data);
  expect(data.relations![0].variants).toContain('menyebar');
  expect(data.relations![1].variants).toBeUndefined();
  expect(reviewedAnswers(data,['informasi','asing'])).toEqual([]);
  expect(reviewedAnswers(data,['informasi','menyebar'])).toEqual([]);
  expect(JSON.parse(original)[0].variants).toBeUndefined();
});
it('pins old scores and old top answers while a new scoring edition is published',()=>{
  const store=openDatabase(':memory:');
  try {
    const snapshot=compileRandomPool(store,true);snapshot.generator=noisyBridgeFixture();
    snapshot.stages=snapshot.stages.filter(stage=>stage.kind==='closest');
    publishRandomPool(store,snapshot,true);
    let service=game(store);const player=service.createPlayer();
    const edition=(store.sqlite.prepare("SELECT version_id FROM random_pool WHERE id='active'").get() as {version_id:string}).version_id;
    const round={kind:'bridge2',clues:['informasi','benih'],target:'sebar'};
    store.sqlite.prepare("INSERT INTO runs(id,player_id,date,mode,version_id,stage_order) VALUES (?,?,?,'random',?,?)").run('old-bridge',player,'2026-10-27',edition,JSON.stringify({generator:1,rounds:[round,round,round,round]}));
    const answered=service.submit('old-bridge',player,{stage:0,word:'biji'});
    const oldTop=service.topAnswers('old-bridge',player,0);
    const saved=store.sqlite.prepare('SELECT result FROM answers WHERE run_id=?').get('old-bridge');
    const next=JSON.parse(JSON.stringify(snapshot));qualifyBridgeScoring(next.generator);publishRandomPool(store,next,true);
    service=game(store);
    expect(service.view('old-bridge',player)).toEqual(answered);
    expect(service.topAnswers('old-bridge',player,0)).toEqual(oldTop);
    expect(service.submit('old-bridge',player,{stage:0,word:'menyebarkan'})).toEqual(answered);
    expect(store.sqlite.prepare('SELECT result FROM answers WHERE run_id=?').get('old-bridge')).toEqual(saved);
    const newEdition=(store.sqlite.prepare("SELECT version_id FROM random_pool WHERE id='active'").get() as {version_id:string}).version_id;
    expect(newEdition).not.toBe(edition);
    const another=service.createPlayer();
    store.sqlite.prepare("INSERT INTO runs(id,player_id,date,mode,version_id,stage_order) VALUES (?,?,?,'random',?,?)").run('new-bridge',another,'2026-10-27',newEdition,JSON.stringify({generator:1,rounds:[round,round,round,round]}));
    expect(service.submit('new-bridge',another,{stage:0,word:'menyebarkan'}).results[0].score).toBe(980);
    expect(service.topAnswers('new-bridge',another,0).referenceOnly).toBe(true);
    expect(service.topAnswers('new-bridge',another,0).answers.every(entry=>!['bekalan','bungkalan','beritanya','beritakan'].includes(entry.word))).toBe(true);
  } finally {store.sqlite.close();}
});
it('requires independent strong evidence for automatic Wordnet bridges while preserving editorial polysemy',()=>{
  const round={kind:'bridge2' as const,clues:['informasi','benih'],target:'sebar'};
  const editorial=noisyBridgeFixture();qualifyBridgeScoring(editorial);
  expect(evaluateRound(editorial,round)?.best).toBe('sebar');
  const automatic=noisyBridgeFixture();automatic.relations![0].source='wordnet-bahasa';
  // The old edition keeps its original interpretation.
  expect(evaluateRound(automatic,round)?.best).toBe('sebar');
  qualifyBridgeScoring(automatic);
  expect(evaluateRound(automatic,round)).toBeNull();
  const index=automatic.words.indexOf('sebar');
  for(const profile of automatic.profiles)profile.similarities[index]=.4;
  expect(evaluateRound(automatic,round)?.best).toBe('sebar');
  automatic.profiles[0].similarities[index]=.2;
  expect(evaluateRound(automatic,round)).toBeNull();
});

function blindClueFixture():RandomGenerator {
  // paru + tarik → napas: the embedding cannot see tarik → napas (a collocation).
  const words=['paru','tarik','napas','nafas','bernapas','udara','mencabut','menarik','parut','meja'];
  const sims=(values:Record<string,number>)=>words.map(word=>values[word]??0);
  return {version:3,words,answers:['napas'],relations:[{answer:'napas',facets:[['paru'],['tarik']]}],excludedCombos:[],profiles:[
    {word:'paru',baseline:0,reference:1,similarities:sims({paru:1,napas:.5,nafas:.5,bernapas:.5,udara:.6,parut:.9})},
    {word:'tarik',baseline:0,reference:1,similarities:sims({tarik:1,napas:-.01,mencabut:.9,menarik:.95})},
    {word:'napas',baseline:0,reference:1,similarities:sims({napas:1,nafas:.9,bernapas:.9,udara:.7})},
  ]};
}
it('credits forms of the reference answer and stands in for a blind clue without promoting one-clue words',()=>{
  const stage=evaluateRound(blindClueFixture(),{kind:'bridge2',clues:['paru','tarik'],target:'napas'})!;
  expect(stage.scores.napas.score).toBe(1000);
  // Affixed form and reviewed spelling of the reference answer.
  expect(stage.scores.bernapas.score).toBe(950);
  expect(stage.scores.nafas.score).toBe(950);
  expect(stage.scores.bernapas.rank).toBe(2);
  // Close to paru and to napas: no longer zeroed by the blind tarik link.
  expect(stage.scores.udara.score).toBeGreaterThan(500);
  expect(stage.scores.udara.score).toBeLessThan(950);
  // The UI still reports the raw link honestly.
  expect(stage.scores.udara.connections[1]).toBe(0);
  // Tied to only one clue, or a form of a clue: no stand-in credit.
  for(const word of ['mencabut','menarik','parut','meja']) expect(stage.scores[word].score).toBe(0);
  expect(evaluateRound(blindClueFixture(),{kind:'bridge2',clues:['paru','tarik'],target:'napas'})).toEqual(stage);
});
it('leaves rounds whose clues all see the reference answer unchanged',()=>{
  const data=blindClueFixture();
  data.profiles[1].similarities[data.words.indexOf('napas')]=.6;
  const stage=evaluateRound(data,{kind:'bridge2',clues:['paru','tarik'],target:'napas'})!;
  expect(stage.scores.udara.score).toBe(0);
  expect(stage.scores.bernapas.score).toBe(950);
});
