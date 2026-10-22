import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const normalize=(word:string)=>word.toLowerCase().normalize('NFC');
const valid=(word:string)=>/^[a-z]{2,32}$/.test(word);
const source=readFileSync('data/sources/id-wordlist.txt','utf8');
const tab=readFileSync('data/sources/wn-data-ind.tab','utf8');
const previous=JSON.parse(readFileSync('content/lexicon.json','utf8')) as string[];
const words=new Set(previous);
for(const raw of source.split(/\s+/)) {const word=normalize(raw);if(valid(word)) words.add(word);}
const synsets=new Map<string,string[]>();
for(const line of tab.split('\n')) {
 const [id,type,raw]=line.split('\t');if(type!=='ind:lemma'||!raw) continue;
 const word=normalize(raw);if(!valid(word)) continue;
 words.add(word);const list=synsets.get(id)??[];if(!list.includes(word)) list.push(word);synsets.set(id,list);
}
// Keep the whole source; no invented affixes or generated filler words.
writeFileSync('content/lexicon.json',JSON.stringify([...words].sort(),null,2)+'\n');
const nodes=new Map<string,{parents:string[];parts:string[];antonyms:string[]}>();
for(const pos of ['noun','verb','adj','adv']) for(const line of readFileSync(`data/sources/wordnet/data.${pos}`,'utf8').split('\n')) {
 if(!/^\d{8} /.test(line)) continue;
 const tokens=line.split(' | ')[0].split(/\s+/), type=tokens[2]==='s'?'a':tokens[2];
 const id=`${tokens[0]}-${type}`,count=parseInt(tokens[3],16);let i=4+count*2;
 const pointers=Number(tokens[i++]),parents:string[]=[],parts:string[]=[],antonyms:string[]=[];
 for(let n=0;n<pointers;n++) {
  const [symbol,offset,targetPos]=tokens.slice(i,i+4);i+=4;
  const target=`${offset}-${targetPos==='s'?'a':targetPos}`;
  if(symbol==='!') antonyms.push(target);
  if(symbol==='@'||symbol==='@i') parents.push(target);
  if(['%p','%m','#p','#m'].includes(symbol)) parts.push(target);
 }
 nodes.set(id,{parents,parts,antonyms});
}
const children=new Map<string,string[]>();
for(const [id,node] of nodes) for(const parent of node.parents) {const list=children.get(parent)??[];list.push(id);children.set(parent,list);}
const broad=new Set('entitas benda objek hal sesuatu orang makhluk keadaan bagian unsur bentuk jenis sistem perihal perbuatan tindakan aktivitas aktiviti proses peristiwa'.split(' '));
const senses=new Map<string,number>();for(const lemmas of synsets.values()) for(const lemma of lemmas) senses.set(lemma,(senses.get(lemma)??0)+1);
const terms=(ids:string[],answer:string)=>[...new Set(ids.flatMap(id=>synsets.get(id)??[]))].filter(w=>w!==answer&&!broad.has(w)&&w.length>=3&&(senses.get(w)??0)<=4);
const records:{answer:string;facets:string[][];source:string;sense:string}[]=[];
for(const [id,lemmas] of synsets) {
 const node=nodes.get(id);if(!node) continue;
 for(const answer of lemmas) {
  if(answer.length<3||broad.has(answer)||(senses.get(answer)??0)>4) continue;
  const synonyms=lemmas.filter(w=>w!==answer&&!broad.has(w)&&w.length>=3&&(senses.get(w)??0)<=4);
  const parents=terms(node.parents,answer);
  const parts=terms(node.parts,answer);
  const descendants=terms(children.get(id)??[],answer).filter(w=>!lemmas.includes(w));
  const antonyms=new Set(terms(node.antonyms,answer));
  const used=new Set<string>();
  const facets=[synonyms,parents,parts,descendants].map(group=>group.filter(word=>{if(used.has(word)||antonyms.has(word)) return false;used.add(word);return true;}).slice(0,4)).filter(group=>group.length);
  if(facets.length>=2) records.push({answer,facets,source:'wordnet-bahasa',sense:id});
 }
}
writeFileSync('content/wordnet-synonyms.json',JSON.stringify([...synsets].filter(([,lemmas])=>lemmas.length>=2).map(([sense,lemmas])=>({sense,lemmas,antonyms:terms(nodes.get(sense)?.antonyms??[],'')})))+'\n');
writeFileSync('content/wordnet-relations.json',JSON.stringify(records)+'\n');
mkdirSync('content/licenses',{recursive:true});
copyFileSync('data/sources/wordnet-LICENSE','content/licenses/WORDNET-BAHASA.txt');
copyFileSync('data/sources/wordnet/LICENSE','content/licenses/PRINCETON-WORDNET.txt');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const report={words:words.size,sourceSha256:{wordlist:hash(source),bahasa:hash(tab)},records:records.length,answers:new Set(records.map(r=>r.answer)).size,triples:records.filter(r=>r.facets.length>=3).length};
writeFileSync('content/lexicon-import.json',JSON.stringify(report,null,2)+'\n');console.log(report);
