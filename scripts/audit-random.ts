import {fingerprint} from '../apps/api/src/scoring.js';
import {hasWordFamilyCollision} from '../apps/api/src/word-family.js';
import {randomInt} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {openDatabase} from '../apps/api/src/db.js';
import {selectRounds,combinationKey,type RandomGenerator,type GeneratedSelection} from '../apps/api/src/random-generator.js';
import {trainDifficulty,type Observation} from '../apps/api/src/adaptive.js';
import {roundFeatures,retrieveCandidates,type RetrievalContext} from '../apps/api/src/retrieval.js';
import {bridgeSeparation} from '../apps/api/src/bridge-quality.js';
import {requalifyPublishedRandomPool} from './content.js';
try {process.loadEnvFile('.env');} catch { /* optional */ }
const store=openDatabase();
try {
 const row=store.sqlite.prepare("SELECT v.snapshot FROM random_pool p JOIN puzzle_versions v ON p.version_id=v.id WHERE p.id='active'").get() as {snapshot:string}|undefined;
 if(!row) throw Error('Bank acak belum diterbitkan.');
 const snapshot=process.argv.includes('--preview')?requalifyPublishedRandomPool(store):JSON.parse(row.snapshot),data=snapshot.generator as RandomGenerator;
 if(![3,4].includes(data?.version)) throw Error('Audit memerlukan generator retrieval v3/v4.');
 const outcomes=store.sqlite.prepare("SELECT a.result,r.version_id FROM answers a JOIN runs r ON r.id=a.run_id WHERE r.mode='random' AND a.stage<4 ORDER BY r.rowid DESC LIMIT 1000").all() as {result:string;version_id:string}[];
 const observations:Observation[]=[];
 const edition=fingerprint(snapshot);
 for(const row of outcomes) {
  if(data.scoringPolicy&&row.version_id!==edition) continue;
  const result=JSON.parse(row.result),features=roundFeatures(data,{kind:result.kind,clues:result.clues},result.best);
  if(features) observations.push({features,outcome:result.skipped?0:result.score/1000});
 }
 const model=trainDifficulty(observations);
 const context:RetrievalContext={exposures:[],model},excluded=new Set<string>();
 const games:{rounds:{clues:string[];best:string;top:{word:string;score:number}[]}[];policy:GeneratedSelection['policy']}[]=[];
 const started=Date.now();
 for(let i=0;i<10;i++) {
  const result=selectRounds(data,randomInt,excluded,context);
  const rounds=result.stages.map(stage=>({clues:stage.clues,best:stage.best,top:Object.entries(stage.scores).filter(([word])=>!stage.referenceAnswers||stage.referenceAnswers.includes(word)).sort((a,b)=>b[1].score-a[1].score||Number(b[0]===stage.best)-Number(a[0]===stage.best)||a[0].localeCompare(b[0])).slice(0,5).map(([word,entry])=>({word,score:entry.score}))}));
  games.push({rounds,policy:result.selection.policy});
  rounds.forEach(round=>{context.exposures.unshift(round);excluded.add(combinationKey(round.clues));});
 }
 const concepts=new Map(data.relations!.map(row=>[row.answer,row.sense??`word:${row.answer}`]));
 const answers=games.flatMap(game=>game.rounds.map(round=>round.best));
 const familyCollisions=games.flatMap(game=>game.rounds).filter(round=>hasWordFamilyCollision([...round.clues,round.best])).length;
 const separations=games.flatMap(game=>game.rounds).map(round=>bridgeSeparation(data,round.clues,round.best));
 const candidates=[...retrieveCandidates(data,'bridge2',model,new Set()),...retrieveCandidates(data,'bridge3',model,new Set())];
 const clueCounts=new Map<string,number>(),pairCounts=new Map<string,number>();
 for(const round of games.flatMap(game=>game.rounds)) {
  round.clues.forEach((clue,i)=>{
   clueCounts.set(clue,(clueCounts.get(clue)??0)+1);
   round.clues.slice(i+1).forEach(other=>{const pair=combinationKey([clue,other]);pairCounts.set(pair,(pairCounts.get(pair)??0)+1);});
  });
 }
 const report={approvalHash:edition,preview:process.argv.includes('--preview'),distinctClues:clueCounts.size,repeatedPairs:[...pairCounts.values()].reduce((sum,count)=>sum+Math.max(0,count-1),0),maximumClueUses:Math.max(0,...clueCounts.values()),eligiblePatterns:new Set(candidates.map(candidate=>candidate.pattern)).size,tooClose:separations.filter(value=>!value.accepted).length,eligibleCombinations:candidates.length,eligibleAnswers:new Set(candidates.map(candidate=>candidate.answer)).size,familyCollisions,generator:data.version,hubs:data.relations!.length,profiles:new Set(data.relations!.flatMap(row=>row.facets.flat())).size,modelSamples:model.samples,games:10,bridgeRounds:answers.length,distinctAnswers:new Set(answers).size,distinctConcepts:new Set(answers.map(answer=>concepts.get(answer))).size,distinctClueSets:excluded.size,elapsedMs:Date.now()-started,details:games};
 mkdirSync('data',{recursive:true});writeFileSync(process.argv.includes('--preview')?'data/random-audit-preview.json':'data/random-audit.json',JSON.stringify(report,null,2));
 if(report.repeatedPairs!==0||report.tooClose!==0||report.familyCollisions!==0||report.distinctAnswers!==40||report.distinctConcepts!==40||report.distinctClueSets!==40) throw Error('Audit gagal: terdapat clue terlalu dekat, pasangan clue berulang, atau jawaban berulang dalam 10 permainan.');
 console.log(JSON.stringify({...report,details:undefined,report:process.argv.includes('--preview')?'data/random-audit-preview.json':'data/random-audit.json'},null,2));
} finally {store.sqlite.close();}
