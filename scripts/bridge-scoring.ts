import synonyms from '../content/wordnet-synonyms.json';
import {bridgeForms} from '../content/bridge-forms.js';
import type {RandomGenerator} from '../apps/api/src/random-generator.js';

// Freeze lexical confidence and reviewed inflections in the edition. Replays
// must never depend on a newer dictionary or on a heuristic stemmer at runtime.
export function qualifyBridgeScoring(data:RandomGenerator) {
  const available=new Set(data.words);
  const lexical=new Set(synonyms.flatMap(group=>group.lemmas).filter(word=>available.has(word)));
  data.relations=(data.relations??[]).map(original=>{
    const relation={...original};
    for(const word of [relation.answer,...relation.facets.flat()]) lexical.add(word);
    // Automatic Wordnet senses do not inherit another sense's inflections.
    if(relation.source!=='wordnet-bahasa') {
      const variants=(bridgeForms[relation.answer]??[]).filter(word=>available.has(word));
      if(variants.length) relation.variants=variants;
    }
    for(const word of relation.variants??[]) lexical.add(word);
    return relation;
  });
  data.scoringPolicy={version:'grounded-bridge-v1',lexicalWords:[...lexical].sort()};
}
