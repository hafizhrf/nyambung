import {closestGroups} from '../content/closest.js';
import {areSynonyms, bridgeSeparation} from '../apps/api/src/bridge-quality.js';
import {sameWordFamily} from '../apps/api/src/word-family.js';
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
  const facets=record.facets.map(group=>group.filter(word=>usable(word)&&!derivative(word,record.answer)&&!areSynonyms(word,record.answer)&&similarity(word,record.answer)>=.14)
   .sort((a,b)=>similarity(b,record.answer)-similarity(a,record.answer)).slice(0,2)).filter(group=>group.length);
  if(facets.length<2) continue;
  const playable=facets.some((group,i)=>facets.slice(i+1).some(other=>group.some(a=>other.some(b=>bridgeSeparation(data,[a,b],record.answer).accepted))));
  if(!playable) continue;
  const confidence=facets.flat().reduce((sum,word)=>sum+similarity(word,record.answer),0)/facets.flat().length;
  if(confidence<.2) continue;
  const quality=confidence+(facets.length>=3?.1:0);
  const existing=candidates.get(record.answer);
  if(!existing||quality>existing.quality) candidates.set(record.answer,{relation:{answer:record.answer,facets,source:record.source,sense:record.sense},quality});
 }
 const relations=[...candidates.values()].sort((a,b)=>b.quality-a.quality).slice(0,6000).map(row=>row.relation);
 const synonyms:(ContentStage & {concept:string})[]=[];
 const seen=new Set<string>();
 for(const [index,group] of closestGroups.entries()) for(const clue of group) {
  if(!words.has(clue)||seen.has(clue)) continue;
  const alternatives=group.filter(word=>words.has(word)&&word!==clue&&!derivative(word,clue));
  if(!alternatives.length) continue;
  const best=alternatives[0];
  const antonyms=rawSynonyms.filter(row=>row.lemmas.includes(clue)&&row.lemmas.includes(best)).flatMap(row=>row.antonyms).filter(word=>words.has(word)&&!group.includes(word));
  synonyms.push({concept:`reviewed-meaning-${index}`,kind:'closest',clues:[clue],best,explanation:'',overrides:Object.fromEntries(alternatives.slice(1).map(word=>[word,[.98]])),excluded:[...new Set(antonyms)]});
  seen.add(clue);
 }
 return {relations,synonyms};
}
