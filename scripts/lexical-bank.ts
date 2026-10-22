import {sameWordFamily,hasWordFamilyCollision} from '../apps/api/src/word-family.js';
import rawRelations from '../content/wordnet-relations.json';
import rawSynonyms from '../content/wordnet-synonyms.json';
import commonWords from '../content/common-words.json';
import type {RandomGenerator,ReviewedBridge} from '../apps/api/src/random-generator.js';
import type {ContentStage} from '../apps/api/src/scoring.js';
import {semanticSimilarity} from '../apps/api/src/vector-index.js';
// Source-backed records are filtered automatically; they are not claimed to be
// individually human-reviewed. Each combination stays within one Wordnet sense.
export function compileLexicalBank(data:RandomGenerator) {
 const words=new Set(data.words),common=new Set(commonWords),manual=new Set(data.relations!.map(r=>r.answer));
 const pairCache=new Map<string,number>();
 const similarity=(a:string,b:string)=>{const key=[a,b].sort().join('|');let value=pairCache.get(key);if(value===undefined){value=semanticSimilarity(data,a,b);pairCache.set(key,value);}return value;};
 const vague=new Set('komponen faktor kategori jenayah kecurian entitas objek bagian unsur jenis keadaan proses aktivitas aktiviti perbuatan sesuatu perihal'.split(' '));
 const usable=(word:string)=>!vague.has(word)&&words.has(word)&&common.has(word)&&word.length>=3&&word.length<=20;
 const derivative=sameWordFamily;
 const candidates=new Map<string,{relation:ReviewedBridge;quality:number}>();
 for(const record of rawRelations) {
  if(manual.has(record.answer)||!usable(record.answer)) continue;
  const facets=record.facets.map(group=>group.filter(word=>usable(word)&&!derivative(word,record.answer)&&similarity(word,record.answer)>=.14)
   .sort((a,b)=>similarity(b,record.answer)-similarity(a,record.answer)).slice(0,2)).filter(group=>group.length);
  if(facets.length<2) continue;
  const playable=facets.some((group,i)=>facets.slice(i+1).some(other=>group.some(a=>other.some(b=>!hasWordFamilyCollision([record.answer,a,b])))));
  if(!playable) continue;
  const confidence=facets.flat().reduce((sum,word)=>sum+similarity(word,record.answer),0)/facets.flat().length;
  if(confidence<.2) continue;
  const quality=confidence+(facets.length>=3?.1:0);
  const existing=candidates.get(record.answer);
  if(!existing||quality>existing.quality) candidates.set(record.answer,{relation:{answer:record.answer,facets,source:record.source,sense:record.sense},quality});
 }
 const relations=[...candidates.values()].sort((a,b)=>b.quality-a.quality).slice(0,6000).map(row=>row.relation);
 const synonymCandidates=new Map<string,{stage:ContentStage & {concept:string};confidence:number}>();
 for(const group of rawSynonyms) for(const clue of group.lemmas) {
  if(!usable(clue)) continue;
  const alternatives=group.lemmas.filter(word=>usable(word)&&word!==clue&&!derivative(word,clue)&&!group.antonyms.includes(word)&&similarity(word,clue)>=.22).sort((a,b)=>similarity(b,clue)-similarity(a,clue));
  if(!alternatives.length) continue;
  const best=alternatives[0],confidence=similarity(best,clue);
  if(confidence<.28) continue;
  const stage:ContentStage & {concept:string}={concept:group.sense,kind:'closest',clues:[clue],best,explanation:'',overrides:Object.fromEntries(alternatives.slice(1,5).map(word=>[word,[.98]])),excluded:group.antonyms.filter(word=>words.has(word)&&word!==best&&word!==clue)};
  const existing=synonymCandidates.get(clue);
  if(!existing||confidence>existing.confidence) synonymCandidates.set(clue,{stage,confidence});
 }
 const synonyms=[...synonymCandidates.values()].sort((a,b)=>b.confidence-a.confidence).slice(0,6000).map(row=>row.stage);
 return {relations,synonyms};
}
