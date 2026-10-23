import {bridgeSeparation,areSynonyms} from './bridge-quality.js';
import {semanticSimilarity} from './vector-index.js';
import { predictDifficulty, trainDifficulty, type DifficultyModel } from './adaptive.js';
import { combinationKey, reviewedAnswers, evaluateRound, type RandomGenerator, type GeneratedRound, type GeneratedSelection } from './random-generator.js';
import type { PublishedStage } from './scoring.js';
export interface Exposure { best:string; clues:string[] }
export interface RetrievalContext { exposures:Exposure[]; model:DifficultyModel }
export interface Candidate { round:GeneratedRound; answer:string; concept?:string; features:number[]; relevance:number; expected:number; separation:number }
const candidateCache=new WeakMap<RandomGenerator,Map<string,Candidate[]>>();
const profileCache=new WeakMap<RandomGenerator,Map<string,RandomGenerator['profiles'][number]>>();
const indexCache=new WeakMap<RandomGenerator,Map<string,number>>();
function indexes(data:RandomGenerator) {
  let map=indexCache.get(data);if(!map) {map=new Map(data.words.map((word,i)=>[word,i]));indexCache.set(data,map);}return map;
}
export function roundFeatures(data:RandomGenerator,round:GeneratedRound,answer:string):number[]|null {
  const index=indexes(data), answerIndex=index.get(answer);
  let profileIndex=profileCache.get(data);if(!profileIndex) {profileIndex=new Map(data.profiles.map(profile=>[profile.word,profile]));profileCache.set(data,profileIndex);}
  const profiles=round.clues.map(clue=>profileIndex!.get(clue));
  if(answerIndex===undefined || (data.version!==4 && profiles.some(profile=>!profile)) || !round.clues.length || round.clues.some(clue=>!index.has(clue))) return null;
  const similarities=round.clues.map((clue,i)=>Math.max(-1,Math.min(1,data.version===4?semanticSimilarity(data,clue,answer):profiles[i]!.similarities[answerIndex])));
  const mean=similarities.reduce((sum,value)=>sum+value,0)/similarities.length;
  const spread=Math.max(...similarities)-Math.min(...similarities);
  const pairs:number[]=[];
  round.clues.forEach((clue,i)=>round.clues.slice(i+1).forEach(other=>pairs.push(data.version===4?semanticSimilarity(data,clue,other):profiles[i]!.similarities[index.get(other)!]??0)));
  return [1,round.kind==='bridge3'?1:0,mean,Math.min(...similarities),spread/2,pairs.length?pairs.reduce((a,b)=>a+b,0)/pairs.length:0,Math.min(1,reviewedAnswers(data,round.clues).length/5),Math.min(1,round.clues.reduce((sum,clue)=>sum+clue.length,0)/(round.clues.length*12))];
}
function overlap(a:string[],b:string[]) {return a.filter(word=>b.includes(word)).length/Math.max(a.length,b.length);}
export function retrieveCandidates(data:RandomGenerator,kind:'bridge2'|'bridge3',model:DifficultyModel,excluded:Set<string>):Candidate[] {
  let cache=candidateCache.get(data);if(!cache) {cache=new Map();candidateCache.set(data,cache);}
  const cached=cache.get(kind);
  if(cached) return cached.filter(candidate=>!excluded.has(combinationKey(candidate.round.clues))).map(candidate=>({...candidate,expected:predictDifficulty(model,candidate.features)}));
  const candidates=new Map<string,Candidate>();
  for(const relation of data.relations??[]) {
    const groups=relation.facets;
    for(let a=0;a<groups.length;a++) for(let b=a+1;b<groups.length;b++) {
      for(const x of groups[a]) for(const y of groups[b]) {
        const sets=kind==='bridge2'?[[x,y]]:groups.slice(b+1).flatMap(group=>group.map(z=>[x,y,z]));
        for(const clues of sets) {
          if(relation.source==='wordnet-bahasa' && clues.some(clue=>areSynonyms(clue,relation.answer))) continue;
          const separation=bridgeSeparation(data,clues,relation.answer);
          if(!separation.accepted) continue;
          const round:GeneratedRound={kind,clues};
          const features=roundFeatures(data,round,relation.answer);if(!features) continue;
          // Hybrid retrieval: explicit reviewed edges establish validity; frozen
          // semantic similarities rank connection balance within that evidence.
          const relevance=.7+.2*Math.max(0,features[2])+.1*Math.max(0,features[3]);
          const candidate={round,answer:relation.answer,concept:relation.sense??`word:${relation.answer}`,features,relevance,separation:separation.novelty,expected:predictDifficulty(model,features)};
          const key=`${relation.answer}/${combinationKey(clues)}`;
          candidates.set(key,candidate);
        }
      }
    }
  }
  const result=[...candidates.values()];cache.set(kind,result);
  return result.filter(candidate=>!excluded.has(combinationKey(candidate.round.clues)));
}
export function selectRetrievedRounds(data:RandomGenerator,pick:(limit:number)=>number,excluded:Set<string>,context:RetrievalContext={exposures:[],model:trainDifficulty([])}):{selection:GeneratedSelection;stages:PublishedStage[]} {
  const blocked=new Set([...data.excludedCombos,...excluded]);
  const selected:Candidate[]=[],rounds:GeneratedRound[]=[],stages:PublishedStage[]=[];
  const answerRecency=new Map<string,number>(), conceptRecency=new Map<string,number>(), conceptByAnswer=new Map(data.relations!.map(relation=>[relation.answer,relation.sense??`word:${relation.answer}`])), clueFrequency=new Map<string,number>();
  context.exposures.forEach((entry,i)=>{
    if(!answerRecency.has(entry.best)) answerRecency.set(entry.best,i);
    const concept=conceptByAnswer.get(entry.best)??`word:${entry.best}`;if(!conceptRecency.has(concept)) conceptRecency.set(concept,i);
    if(i<80) entry.clues.forEach(clue=>clueFrequency.set(clue,(clueFrequency.get(clue)??0)+1));
  });
  let explorations=0;
  for(const [stageIndex,kind] of (['bridge2','bridge2','bridge2','bridge3'] as const).entries()) {
    let pool=retrieveCandidates(data,kind,context.model,blocked).filter(candidate=>
      !selected.some(previous=>previous.answer===candidate.answer || previous.concept===candidate.concept || previous.round.clues.some(clue=>candidate.round.clues.includes(clue))));
    if(!pool.length) throw new Error('Bank retrieval belum cukup untuk permainan baru.');
    // Prioritize unseen answer hubs. When exhausted, recycle the least recent
    // tier, never collapse back to the handful of highest cosine neighbours.
    const freshConcepts=pool.filter(candidate=>!conceptRecency.has(candidate.concept!));
    if(freshConcepts.length) pool=freshConcepts;
    const unseen=pool.filter(candidate=>!answerRecency.has(candidate.answer));
    if(unseen.length) pool=unseen;
    else {
      const oldest=Math.max(...pool.map(candidate=>answerRecency.get(candidate.answer)!));
      pool=pool.filter(candidate=>answerRecency.get(candidate.answer)!>=oldest-3);
    }
    const target=[.65,.6,.55,.55][stageIndex];
    const rank=(candidate:Candidate)=>{
      const shared=Math.max(0,...selected.map(previous=>overlap(previous.round.clues,candidate.round.clues)));
      const recentPattern=Math.max(0,...context.exposures.slice(0,40).map(previous=>overlap(previous.clues,candidate.round.clues)));
      const repeated=candidate.round.clues.reduce((sum,word)=>sum+Math.min(1,(clueFrequency.get(word)??0)/4),0)/candidate.round.clues.length;
      return .2*candidate.relevance+.35*(1-Math.abs(candidate.expected-target))+.3*candidate.separation-.25*recentPattern-.2*repeated-.3*shared;
    };
    // Equal-size retrieval per answer prevents hubs with more facets from being
    // sampled more often. MMR-style novelty penalties diversify the shortlist.
    const perAnswer=new Map<string,Candidate[]>();
    for(const candidate of pool) {const list=perAnswer.get(candidate.answer)??[];list.push(candidate);perAnswer.set(candidate.answer,list);}
    const hubs=[...perAnswer.values()].map(list=>{
      list.sort((a,b)=>rank(b)-rank(a));const shortlist=list.slice(0,6);
      return shortlist[pick(shortlist.length)];
    }).sort((a,b)=>rank(b)-rank(a));
    const explore=pick(100)<20; if(explore) explorations++;
    const shortlist=explore?hubs:hubs.slice(0,Math.min(16,hubs.length));
    const chosen=shortlist[pick(shortlist.length)];
    const round:GeneratedRound={...chosen.round,clues:[...chosen.round.clues],target:chosen.answer,features:chosen.features};
    for(let i=round.clues.length-1;i>0;i--) {const j=pick(i+1);[round.clues[i],round.clues[j]]=[round.clues[j],round.clues[i]];}
    const stage=evaluateRound(data,round);if(!stage) throw new Error('Bukti hubungan retrieval tidak valid.');
    // The actual scoring winner, not just the retrieval hub, is the exposure.
    if(selected.some(previous=>previous.answer===stage.best)) throw new Error('Jawaban retrieval berulang dalam sesi.');
    selected.push({...chosen,answer:stage.best});rounds.push(round);stages.push(stage);blocked.add(combinationKey(round.clues));
  }
  return {selection:{generator:1,rounds,policy:{version:'retrieval-ridge-v1',samples:context.model.samples,weights:context.model.weights,explorations}},stages};
}
