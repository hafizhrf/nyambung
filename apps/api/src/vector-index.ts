import type {ClueProfile,RandomGenerator} from './random-generator.js';
import type {ContentStage,PublishedStage,ScoreEntry} from './scoring.js';
export interface PackedVectors {encoding:'unit-int8-v1';dimensions:number;data:string}
interface Index {bytes:Int8Array;norms:Float32Array;words:Map<string,number>;profiles:Map<string,ClueProfile>;pairs:Map<number,number>}
const cache=new WeakMap<RandomGenerator,Index>();
function index(data:RandomGenerator):Index {
 let value=cache.get(data);if(value) return value;
 const packed=data.packed;if(!packed||packed.encoding!=='unit-int8-v1'||packed.dimensions<1) throw Error('Indeks vektor tidak valid.');
 const buffer=Buffer.from(packed.data,'base64');
 if(buffer.length!==data.words.length*packed.dimensions) throw Error('Ukuran indeks vektor tidak cocok.');
 const bytes=new Int8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength),norms=new Float32Array(data.words.length);
 for(let i=0;i<data.words.length;i++) {let squared=0;for(let d=0;d<packed.dimensions;d++) squared+=bytes[i*packed.dimensions+d]**2;norms[i]=Math.sqrt(squared);}
 value={bytes,norms,words:new Map(data.words.map((word,i)=>[word,i])),profiles:new Map(),pairs:new Map()};cache.set(data,value);return value;
}
export function packVectors(words:string[],vectors:Map<string,number[]>):PackedVectors {
 const dimensions=vectors.get(words[0])!.length,bytes=new Int8Array(words.length*dimensions);
 words.forEach((word,i)=>{
  const vector=vectors.get(word)!;if(vector.length!==dimensions) throw Error('Dimensi embedding berbeda.');
  const norm=Math.sqrt(vector.reduce((sum,v)=>sum+v*v,0));if(!norm) throw Error('Embedding kosong.');
  vector.forEach((value,d)=>bytes[i*dimensions+d]=Math.max(-127,Math.min(127,Math.round(value/norm*127))));
 });
 return {encoding:'unit-int8-v1',dimensions,data:Buffer.from(bytes.buffer).toString('base64')};
}
function dot(data:RandomGenerator,source:Index,a:number,b:number):number {
 const dimensions=data.packed!.dimensions,offsetA=a*dimensions,offsetB=b*dimensions;let sum=0;
 for(let d=0;d<dimensions;d++) sum+=source.bytes[offsetA+d]*source.bytes[offsetB+d];
 return source.norms[a]&&source.norms[b]?Math.round(sum/(source.norms[a]*source.norms[b])*1e6)/1e6:0;
}
export function semanticSimilarity(data:RandomGenerator,a:string,b:string):number {
 if(data.version!==4) {const i=data.words.indexOf(b);return data.profiles.find(profile=>profile.word===a)?.similarities[i]??0;}
 const source=index(data),i=source.words.get(a),j=source.words.get(b);
 if(i===undefined||j===undefined) return 0;
 const key=Math.min(i,j)*data.words.length+Math.max(i,j),cached=source.pairs.get(key);if(cached!==undefined) return cached;
 const value=dot(data,source,i,j);if(source.pairs.size>=200000) source.pairs.clear();source.pairs.set(key,value);return value;
}
export function profileFor(data:RandomGenerator,word:string):ClueProfile|undefined {
 if(data.version!==4) return data.profiles.find(profile=>profile.word===word);
 const source=index(data),i=source.words.get(word);if(i===undefined) return;
 const existing=source.profiles.get(word);if(existing) return existing;
 const similarities=data.words.map((_,j)=>dot(data,source,i,j)),sorted=[...similarities].sort((a,b)=>a-b);
 const profile={word,similarities,baseline:sorted[Math.floor(sorted.length*.1)],reference:sorted[Math.floor(sorted.length*.999)]};
 if(source.profiles.size>=12) source.profiles.delete(source.profiles.keys().next().value!);
 source.profiles.set(word,profile);return profile;
}
export function evaluateClosest(data:RandomGenerator,stage:ContentStage):PublishedStage {
 const profile=profileFor(data,stage.clues[0]);if(!profile) throw Error('Profil sinonim belum tersedia.');
 const scores:Record<string,ScoreEntry>={},histogram=new Uint32Array(1001),excluded=new Set(stage.excluded??[]);
 data.words.forEach((word,i)=>{
  if(stage.clues.includes(word)) return;
  const strength=Math.pow(Math.max(0,Math.min(1,(profile.similarities[i]-profile.baseline)/Math.max(1e-9,profile.reference-profile.baseline))),.55);
  const connection=excluded.has(word)?0:word===stage.best?1:stage.overrides[word]?.[0]??strength;
  const score=excluded.has(word)?0:word===stage.best?1000:stage.overrides[word]?Math.round(1000*connection):Math.round(949*connection);
  scores[word]={score,connections:[Math.round(connection*1000)/1000],similarities:[profile.similarities[i]]};histogram[score]++;
 });
 const ranks=new Uint32Array(1001);let above=0;for(let score=1000;score>=0;score--) {ranks[score]=above+1;above+=histogram[score];}
 Object.values(scores).forEach(entry=>entry.rank=ranks[entry.score]);
 return {...stage,scores,vocabularySize:Object.keys(scores).length};
}
