import { bridgeSeparation } from './bridge-quality.js';
import { profileFor,type PackedVectors } from './vector-index.js';
import { selectRetrievedRounds, type RetrievalContext } from './retrieval.js';
import type { StageKind } from '@nyambung/shared';
import type { PublishedStage, ScoreEntry } from './scoring.js';
export interface ClueProfile { word:string; similarities:number[]; baseline:number; reference:number }
export interface ReviewedBridge { answer:string; facets:string[][]; source?:string; sense?:string }
export interface RandomGenerator {
  version:1|2|3|4; facetPolicy?:'distinct-roles-v1'; bridgePolicy?:'cross-context-v1'; packed?:PackedVectors; relations?:ReviewedBridge[]; words:string[]; answers:string[]; profiles:ClueProfile[]; excludedCombos:string[];
}
export interface GeneratedRound { kind:StageKind; clues:string[]; target?:string; features?:number[] }
export interface GeneratedSelection { generator:1; rounds:GeneratedRound[]; closestIndex?:number; policy?:{version:'retrieval-ridge-v1';samples:number;weights:number[];explorations:number} }
const lookupCache = new WeakMap<RandomGenerator, { indexes:Map<string,number>; allowed:Set<string>; answerIndexes:number[] }>();
const connectionCache = new WeakMap<ClueProfile, Float64Array>();
function lookup(data:RandomGenerator) {
  let cached=lookupCache.get(data);
  if (!cached) {
    const indexes=new Map(data.words.map((word,index)=>[word,index]));
    cached={indexes,allowed:new Set(data.answers),answerIndexes:data.answers.map(word=>indexes.get(word)).filter((index):index is number=>index !== undefined)};
    lookupCache.set(data,cached);
  }
  return cached;
}
function strengths(profile:ClueProfile) {
  let cached=connectionCache.get(profile);
  if (!cached) {
    cached=Float64Array.from(profile.similarities.map(similarity=>Math.pow(Math.max(0,Math.min(1,(similarity-profile.baseline)/(profile.reference-profile.baseline))),.55)));
    connectionCache.set(profile,cached);
  }
  return cached;
}
export const combinationKey = (clues:string[]) => [...clues].sort().join('|');
export function evaluateRound(data:RandomGenerator, round:GeneratedRound, checkQuality = false): PublishedStage | null {
  if (data.version === 2 || data.version === 3 || data.version === 4) return evaluateReviewedRound(data, round);
  if (data.version !== 1 || round.clues.length !== (round.kind === 'bridge3' ? 3 : round.kind === 'bridge2' ? 2 : 1)) return null;
  const profiles = round.clues.map(word => profileFor(data,word));
  if (profiles.some(profile => !profile) || new Set(round.clues).size !== round.clues.length) return null;
  const p = profiles as ClueProfile[];
  const { indexes, allowed, answerIndexes } = lookup(data);
  if (checkQuality && p.length > 1) {
    for (let i=0;i<p.length;i++) for (let j=i+1;j<p.length;j++) {
      const similarity = p[i].similarities[indexes.get(p[j].word)!];
      if (similarity > .14 || similarity < -.12) return null;
    }
  }
  const clues = new Set(round.clues);
  const rawScores = new Float64Array(data.words.length);
  const connections = p.map(strengths);
  let top = -1, topValue = 0;
  for (let i=0;i<data.words.length;i++) {
    if (clues.has(data.words[i])) continue;
    let inverse = 0, valid = true;
    for (const connection of connections) { if (connection[i] <= 0) { valid=false;break; } inverse += 1/connection[i]; }
    const value = valid ? p.length/inverse : 0; // Every clue matters; no weakest-link boost.
    rawScores[i] = value;
    if (value > topValue) { topValue=value; top=i; }
  }
  if (top < 0 || !allowed.has(data.words[top])) return null;
  if (checkQuality) {
    if (p.some(profile => profile.similarities[top] < (p.length === 3 ? .09 : .12))) return null;
    const alternatives = answerIndexes.filter(i => !clues.has(data.words[i]) && rawScores[i] >= topValue*.88);
    if (alternatives.length < 3) return null;
  }
  const scores:Record<string,ScoreEntry> = {};
  const histogram = new Uint32Array(1001);
  for (let i=0;i<data.words.length;i++) {
    const word = data.words[i]; if (clues.has(word)) continue;
    const score = Math.max(0, Math.min(1000, Math.round(1000*rawScores[i]/topValue)));
    histogram[score]++;
    scores[word] = { score, connections:connections.map(values => Math.round(values[i]*1000)/1000), similarities:p.map(profile => profile.similarities[i]) };
  }
  const ranks = new Uint32Array(1001); let above=0;
  for (let score=1000;score>=0;score--) { ranks[score]=above+1;above+=histogram[score]; }
  for (const entry of Object.values(scores)) entry.rank = ranks[entry.score];
  return { ...round, best:data.words[top], explanation:`${data.words[top]} mendapat gabungan kedekatan tertinggi terhadap ${round.clues.join(', ')} di kamus edisi ini. Jawaban lain tetap dinilai dari setiap sambungan.`, overrides:{}, vocabularySize:data.words.length-round.clues.length, scores };
}
export function selectRounds(data:RandomGenerator, pick:(limit:number)=>number, excluded:Set<string> = new Set(), context?:RetrievalContext): { selection:GeneratedSelection; stages:PublishedStage[] } {
  if (data.version === 3 || data.version === 4) return selectRetrievedRounds(data,pick,excluded,context);
  if (data.version === 2) return selectReviewedRounds(data, pick, excluded);
  const used = new Set<string>(); const rounds:GeneratedRound[]=[]; const stages:PublishedStage[]=[];
  const blocked = new Set([...data.excludedCombos, ...excluded]);
  for (const kind of ['bridge2','bridge2','bridge2','bridge3'] as const) {
    let accepted = false;
    for (let attempt=0;attempt<600;attempt++) {
      const count = kind === 'bridge3' ? 3 : 2;
      const pool = data.profiles.map(profile => profile.word).filter(word => !used.has(word));
      const clues:string[]=[];
      while (clues.length<count) clues.push(pool.splice(pick(pool.length),1)[0]);
      const key=combinationKey(clues); if (blocked.has(key)) continue;
      const round={ kind, clues }; const stage=evaluateRound(data, round, true);
      if (!stage) continue;
      rounds.push(round); stages.push(stage); blocked.add(key); clues.forEach(word=>used.add(word)); accepted=true;break;
    }
    if (!accepted) throw new Error('Belum menemukan kombinasi acak yang seimbang. Coba lagi.');
  }
  return { selection:{ generator:1, rounds }, stages };
}

// A numerical nearest neighbour is not evidence that a bridge makes sense.
// Only reviewed cross-facet associations can define the answer for new rounds.
const relationCache=new WeakMap<RandomGenerator,Map<string,number[]>>();
export function reviewedAnswers(data:RandomGenerator,clues:string[]):string[] {
 let index=relationCache.get(data);if(!index) {
  index=new Map();(data.relations??[]).forEach((relation,i)=>{for(const clue of new Set(relation.facets.flat())) {const list=index!.get(clue)??[];list.push(i);index!.set(clue,list);}});relationCache.set(data,index);
 }
 const candidates=clues.map(clue=>index!.get(clue)??[]).sort((a,b)=>a.length-b.length)[0]??[];
 return [...new Set(candidates.filter(i=>{
  const relation=data.relations![i];
  if(clues.includes(relation.answer)) return false;
  const first=clues.map(clue=>relation.facets.findIndex(group=>group.includes(clue)));
  if(first.some(index=>index<0)) return false;
  if(new Set(first).size===clues.length) return true;
  if(data.facetPolicy!=='distinct-roles-v1') return false;
  // A clue may occur in several reviewed roles. Match distinct facets rather
  // than rejecting a valid bridge because its first matching role overlaps.
  const match=(position:number,used:Set<number>):boolean=>position===clues.length || relation.facets.some((group,index)=>
    !used.has(index)&&group.includes(clues[position])&&match(position+1,new Set([...used,index])));
  return match(0,new Set());
 }).map(i=>data.relations![i].answer))];
}
function evaluateReviewedRound(data:RandomGenerator, round:GeneratedRound):PublishedStage|null {
  if (!['bridge2','bridge3'].includes(round.kind) || round.clues.length!==(round.kind==='bridge3'?3:2) || new Set(round.clues).size!==round.clues.length) return null;
  const approved=new Set(reviewedAnswers(data,round.clues));
  const profiles=round.clues.map(word=>profileFor(data,word));
  if (!approved.size || profiles.some(profile=>!profile) || (data.version>=3 && round.target && !approved.has(round.target))) return null;
  const p=profiles as ClueProfile[], connections=p.map(strengths);
  const harmonic=(values:number[])=>values.some(value=>value<=0)?0:values.length/values.reduce((sum,value)=>sum+1/value,0);
  const scores:Record<string,ScoreEntry>={};
  let best='', bestValue=-1;
  for (let i=0;i<data.words.length;i++) {
    const word=data.words[i]; if (round.clues.includes(word)) continue;
    const values=connections.map(values=>values[i]);
    // Reviewed connections correct embedding blind spots. Other dictionary words
    // remain playable and receive their own continuous semantic score (0–949).
    if (approved.has(word)) for(let j=0;j<values.length;j++) values[j]=Math.max(.94,values[j]);
    const value=harmonic(values);
    if (approved.has(word) && value>bestValue) {best=word;bestValue=value;}
    scores[word]={score:Math.min(949,Math.round(949*value)),connections:values.map(value=>Math.round(value*1000)/1000),similarities:p.map(profile=>profile.similarities[i])};
  }
  if(data.version>=3 && round.target && scores[round.target]) {best=round.target;bestValue=harmonic(scores[best].connections);}
  if (!best) return null;
  for (const word of approved) if (scores[word]) scores[word].score=Math.min(1000,Math.round(1000*harmonic(scores[word].connections)/bestValue));
  scores[best].score=1000;
  const histogram=new Uint32Array(1001), ranks=new Uint32Array(1001);
  for (const entry of Object.values(scores)) histogram[entry.score]++;
  let above=0;for(let score=1000;score>=0;score--) {ranks[score]=above+1;above+=histogram[score];}
  for (const entry of Object.values(scores)) entry.rank=ranks[entry.score];
  return {...round,best,explanation:'',overrides:{},scores,vocabularySize:Object.keys(scores).length};
}
const reviewedCandidateCache=new WeakMap<RandomGenerator,Map<string,{round:GeneratedRound;answers:string[]}[]>>();
function selectReviewedRounds(data:RandomGenerator,pick:(limit:number)=>number,excluded:Set<string>) {
  const blocked=new Set([...data.excludedCombos,...excluded]);
  const used=new Set<string>(), answers=new Set<string>(), rounds:GeneratedRound[]=[], stages:PublishedStage[]=[];
  let cache=reviewedCandidateCache.get(data);
  if(!cache) {cache=new Map();reviewedCandidateCache.set(data,cache);}
  for (const kind of ['bridge2','bridge2','bridge2','bridge3'] as const) {
    let eligible=cache.get(kind);
    if(!eligible) {
      const candidates:GeneratedRound[]=[];
      for (const relation of data.relations ?? []) {
        const groups=relation.facets;
        for(let a=0;a<groups.length;a++) for(let b=a+1;b<groups.length;b++) {
          for (const x of groups[a]) for (const y of groups[b]) {
            if (kind==='bridge2') candidates.push({kind,clues:[x,y]});
            else for(let c=b+1;c<groups.length;c++) for(const z of groups[c]) candidates.push({kind,clues:[x,y,z]});
          }
        }
      }
      // Quality depends on the edition, while recency depends on each game.
      // Compute the enlarged bank once rather than rechecking every edge per turn.
      const unique=[...new Map(candidates.map(round=>[combinationKey(round.clues),round])).values()];
      eligible=unique.map(round=>({round,answers:reviewedAnswers(data,round.clues).filter(answer=>bridgeSeparation(data,round.clues,answer).accepted)})).filter(candidate=>candidate.answers.length>0);
      cache.set(kind,eligible);
    }
    const pool=eligible.filter(candidate=>!blocked.has(combinationKey(candidate.round.clues)) && candidate.round.clues.every(word=>!used.has(word)) && candidate.answers.every(answer=>!answers.has(answer)));
    if (!pool.length) throw new Error('Bank kurasi acak belum cukup untuk permainan baru.');
    const selected=pool[pick(pool.length)].round;
    const round={...selected,clues:[...selected.clues]};
    // Shuffle clue positions too, while keeping a deterministic stored descriptor.
    for(let i=round.clues.length-1;i>0;i--) {const j=pick(i+1);[round.clues[i],round.clues[j]]=[round.clues[j],round.clues[i]];}
    const stage=evaluateReviewedRound(data,round);
    if (!stage) throw new Error('Hubungan kurasi belum lengkap.');
    rounds.push(round);stages.push(stage);answers.add(stage.best);
    round.clues.forEach(word=>used.add(word));blocked.add(combinationKey(round.clues));
  }
  return {selection:{generator:1 as const,rounds},stages};
}
