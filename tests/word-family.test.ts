import {expect,it} from 'vitest';
import {sameWordFamily,hasWordFamilyCollision} from '../apps/api/src/word-family.js';
import {retrieveCandidates} from '../apps/api/src/retrieval.js';
import {trainDifficulty} from '../apps/api/src/adaptive.js';
import type {RandomGenerator} from '../apps/api/src/random-generator.js';
it('detects Indonesian affixes, nasal restoration and borrowed extensions',()=>{
 for(const [a,b] of [['tinju','bertinju'],['tinju','meninju'],['bertinju','meninju'],['intelek','intelektual'],['makan','makanan'],['pukul','memukul'],['sapu','menyapu'],['tulis','menulis'],['buku','bukunya'],['ubah','perubahan'],['cinta','mencintai']]) {
  expect(sameWordFamily(a,b),`${a}/${b}`).toBe(true);expect(sameWordFamily(b,a)).toBe(true);
 }
 for(const [a,b] of [['buku','kertas'],['makanan','mall'],['sapi','sapu'],['kaki','kaku'],['nasi','nasional'],['kunci','musik']]) expect(sameWordFamily(a,b),`${a}/${b}`).toBe(false);
});
it('blocks collisions between clues even when the answer has a different root',()=>{
 const relations=[
  {answer:'meninju',facets:[['bertinju'],['tinju']]},
  {answer:'cerdas',facets:[['intelek'],['intelektual']]},
  {answer:'gelut',facets:[['bertinju'],['tinju']]},
  {answer:'pukul',facets:[['sarung'],['ring']]},
 ];
 const words=[...new Set(relations.flatMap(row=>[row.answer,...row.facets.flat()]))];
 const data:RandomGenerator={version:4,words,answers:words,relations,profiles:[],excludedCombos:[]};
 // No vector index is needed for bad candidates: reject them before retrieval.
 expect(hasWordFamilyCollision(['intelek','intelektual','cerdas'])).toBe(true);
 expect(hasWordFamilyCollision(['bertinju','tinju','meninju'])).toBe(true);
 const bad={...data,relations:relations.slice(0,3)};
 expect(retrieveCandidates(bad,'bridge2',trainDifficulty([]),new Set())).toEqual([]);
});
