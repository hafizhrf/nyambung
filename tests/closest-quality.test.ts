import {describe,it,expect} from 'vitest';
import {closestGroups,isReviewedClosest} from '../content/closest.js';
import {sameWordFamily} from '../apps/api/src/word-family.js';
describe('reviewed closest meanings',()=>{
 it('rejects abbreviations, membership, and related words without a shared meaning',()=>{
  for(const [a,b] of [['juni','jun'],['juni','bulan'],['piano','musik'],['pengatur','pengontrol']]) expect(isReviewedClosest(a,b)).toBe(false);
 });
 it('keeps varied playable meanings instead of repeating one small pool',()=>{
  const clues=new Set(closestGroups.flatMap(group=>group.filter(a=>group.some(b=>a!==b&&!sameWordFamily(a,b)))));
  expect(clues.size).toBeGreaterThan(200);
  for(const [a,b] of [['lelah','letih'],['sunyi','hening'],['teman','kawan'],['cerdas','pintar'],['bulan','rembulan']]) expect(isReviewedClosest(a,b)).toBe(true);
 });
});

import {compileLexicalBank} from '../scripts/lexical-bank.js';
import {packVectors} from '../apps/api/src/vector-index.js';
it('publishes only reviewed meaning pairs even when abbreviation vectors are available',()=>{
 const words=['letih','lelah','cerdas','pintar','gelap','kelam','juni','jun','bulan','rembulan'];
 const vectors=new Map(words.map((word,i)=>[word,words.map((_,j)=>i===j?1:0)]));
 const bank=compileLexicalBank({version:4,words,packed:packVectors(words,vectors),answers:[],profiles:[],relations:[],excludedCombos:[]});
 expect(bank.synonyms).toHaveLength(8);
 expect(bank.synonyms.some(stage=>stage.clues[0]==='juni'||stage.best==='jun')).toBe(false);
 expect(bank.synonyms.every(stage=>isReviewedClosest(stage.clues[0],stage.best))).toBe(true);
});
