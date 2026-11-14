import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {yearEndPuzzles,yearEndStart,yearEndEnd} from '../content/daily-year-end.js';
import {isReviewedClosest} from '../content/closest.js';
import {bridgeSeparation} from '../apps/api/src/bridge-quality.js';
import {sameWordFamily} from '../apps/api/src/word-family.js';
import {combinationKey,reviewedAnswers} from '../apps/api/src/random-generator.js';
import {contentStageSchema,fingerprint,reviewClosestStage,type ContentStage,type Snapshot} from '../apps/api/src/scoring.js';
import {addDays,isPuzzleDate,wibDate} from '../apps/api/src/time.js';
import {openDatabase,type Store} from '../apps/api/src/db.js';

export interface ScheduledPacket {date:string;number:number;demo:boolean;snapshot:string;publishedAt:string}
export function compileSchedule(source:Snapshot,scoringRef:string,days:ContentStage[][],start:string,reserved=new Set<string>()):ScheduledPacket[] {
  const data=source.generator;
  if(!isPuzzleDate(start)||!days.length)throw Error('Rentang jadwal tidak valid.');
  if(data?.version!==4||data.scoringPolicy?.version!=='grounded-bridge-v1'||source.scoringRef||fingerprint(source)!==scoringRef)throw Error('Indeks skor beku tidak valid.');
  const words=new Set(data.words),blocked=new Set(source.blocked),seen=new Set(reserved),errors:string[]=[];
  const publishedAt=new Date().toISOString();
  const packets=days.map((stages,day)=>{
    const date=addDays(start,day),used=new Set<string>(),answers=new Set<string>();
    if(stages.length!==5)errors.push(`${date}: harus lima babak.`);
    const descriptors=stages.map((original,index)=>{
      const at=`${date} babak ${index+1}`;
      const stage=reviewClosestStage(original,words);
      if(!contentStageSchema.safeParse(stage).success||stage.kind!==(index<3?'bridge2':index===3?'bridge3':'closest'))errors.push(`${at}: struktur tidak valid.`);
      if([stage.best,...stage.clues,...Object.keys(stage.overrides)].some(word=>!words.has(word)||blocked.has(word)))errors.push(`${at}: kata belum tersedia.`);
      if(stage.clues.some(word=>used.has(word)))errors.push(`${at}: petunjuk berulang dalam satu hari.`);
      stage.clues.forEach(word=>used.add(word));
      const key=combinationKey(stage.clues);
      if(seen.has(key))errors.push(`${at}: kombinasi pernah dijadwalkan.`);seen.add(key);
      if(answers.has(stage.best))errors.push(`${at}: jawaban berulang dalam satu hari.`);answers.add(stage.best);
      if(stage.kind==='closest') {
        if(!isReviewedClosest(stage.clues[0],stage.best)||sameWordFamily(stage.clues[0],stage.best))errors.push(`${at}: sinonim belum ditinjau.`);
      } else {
        if(!reviewedAnswers(data,stage.clues).includes(stage.best))errors.push(`${at}: hubungan tidak didukung kurasi.`);
        if(!bridgeSeparation(data,stage.clues,stage.best).accepted)errors.push(`${at}: petunjuk terlalu dekat atau serumpun.`);
        if(Object.keys(stage.overrides).length)errors.push(`${at}: alternatif harus didukung indeks kurasi.`);
      }
      return {...stage,scores:{},vocabularySize:data.words.length-stage.clues.length};
    });
    const snapshot:Snapshot={version:1,model:source.model,formula:'curated-daily-packed-v1/grounded-bridge-v1/reviewed-closest-v1',vocabularyHash:source.vocabularyHash,scoringRef,aliases:source.aliases,blocked:source.blocked,stages:descriptors};
    return {date,number:Math.floor((Date.parse(`${date}T00:00:00Z`)-Date.parse('2026-10-22T00:00:00Z'))/86400000)+1,demo:false,snapshot:JSON.stringify(snapshot),publishedAt};
  });
  if(errors.length)throw Error(errors.join('\n'));
  return packets;
}
export function reserveDailyContent(source:Snapshot,packets:ScheduledPacket[],reserved=new Set<string>()):Snapshot {
  const keys=new Set([...reserved,...packets.flatMap(packet=>(JSON.parse(packet.snapshot) as Snapshot).stages.map(stage=>combinationKey(stage.clues)))]);
  const next:Snapshot={...source,generator:{...source.generator!,excludedCombos:[...new Set([...source.generator!.excludedCombos,...keys])]},stages:source.stages.filter(stage=>!keys.has(combinationKey(stage.clues)))};
  if(!next.stages.some(stage=>stage.kind==='closest'))throw Error('Reservasi menyisakan bank sinonim kosong.');
  return next;
}
export function publishSchedule(store:Store,packets:ScheduledPacket[],scoringRef:string,reservedRandom:Snapshot) {
  const version=fingerprint(reservedRandom),randomText=JSON.stringify(reservedRandom);
  return store.sqlite.transaction(()=>{
    const source=store.sqlite.prepare('SELECT snapshot,demo FROM puzzle_versions WHERE id=?').get(scoringRef) as {snapshot:string;demo:number}|undefined;
    if(!source||source.demo||fingerprint(JSON.parse(source.snapshot))!==scoringRef)throw Error('Indeks skor tidak ditemukan atau berubah.');
    const active=store.sqlite.prepare("SELECT version_id FROM random_pool WHERE id='active'").get() as {version_id:string}|undefined;
    if(active&&active.version_id!==scoringRef&&active.version_id!==version)throw Error('Bank acak berubah sejak preview; tinjau ulang.');
    // Check every conflict before any write; publication only inserts new days.
    for(const packet of packets) {
      const old=store.sqlite.prepare('SELECT snapshot,number,demo FROM daily WHERE date=?').get(packet.date) as {snapshot:string;number:number;demo:number}|undefined;
      if(old&&(old.snapshot!==packet.snapshot||old.number!==packet.number||old.demo!==Number(packet.demo)))throw Error(`${packet.date} sudah diterbitkan dengan konten lain.`);
      const snapshot=JSON.parse(packet.snapshot) as Snapshot;
      if(snapshot.scoringRef!==scoringRef)throw Error('Referensi skor paket tidak sesuai.');
    }
    let inserted=0;
    const insert=store.sqlite.prepare('INSERT OR IGNORE INTO daily(date,number,demo,snapshot,published_at) VALUES (?,?,?,?,?)');
    for(const packet of packets)inserted+=insert.run(packet.date,packet.number,Number(packet.demo),packet.snapshot,packet.publishedAt).changes;
    store.sqlite.prepare('INSERT OR IGNORE INTO puzzle_versions(id,snapshot,demo) VALUES (?,?,0)').run(version,randomText);
    store.sqlite.prepare("INSERT INTO random_pool(id,version_id) VALUES ('active',?) ON CONFLICT(id) DO UPDATE SET version_id=excluded.version_id").run(version);
    return {inserted,randomVersion:version};
  }).immediate();
}
function existingKeys(store:Store,exceptDates:Set<string>) {
  // Extract only clues; do not load the existing large score tables into JS.
  const columns=Array.from({length:5},(_,i)=>`json_extract(snapshot,'$.stages[${i}].clues') AS c${i}`).join(',');
  const rows=store.sqlite.prepare(`SELECT date,${columns} FROM daily`).all() as Record<string,string>[];
  return new Set(rows.filter(row=>!exceptDates.has(row.date)).flatMap(row=>Array.from({length:5},(_,i)=>combinationKey(JSON.parse(row[`c${i}`])))));
}
async function main() {
  try{process.loadEnvFile(resolve('.env'));}catch{}
  const apply=process.argv.includes('--apply'),reviewPath=resolve('data/daily-year-end-review.json');
  const prior=apply?JSON.parse(readFileSync(reviewPath,'utf8')):undefined;
  const store=openDatabase();
  try {
    if(yearEndPuzzles.length!==57||addDays(yearEndStart,56)!==yearEndEnd)throw Error('Jadwal belum mencapai akhir tahun.');
    const scoringRef=prior?.scoringRef??(store.sqlite.prepare("SELECT version_id FROM random_pool WHERE id='active'").get() as {version_id:string}).version_id;
    const row=store.sqlite.prepare('SELECT snapshot,demo FROM puzzle_versions WHERE id=?').get(scoringRef) as {snapshot:string;demo:number};
    if(!row||row.demo)throw Error('Indeks skor produksi belum tersedia.');
    const source=JSON.parse(row.snapshot) as Snapshot;
    const dates=new Set(yearEndPuzzles.map((_,i)=>addDays(yearEndStart,i)));
    const reserved=existingKeys(store,dates);
    const packets=compileSchedule(source,scoringRef,yearEndPuzzles,yearEndStart,reserved);
    const random=reserveDailyContent(source,packets,reserved);
    const approvalHash=fingerprint({packets:packets.map(({publishedAt,...packet})=>packet),randomVersion:fingerprint(random)});
    const review={approvalHash,scoringRef,first:packets[0].date,last:packets.at(-1)!.date,days:packets.length,rounds:packets.length*5,bytes:packets.reduce((sum,packet)=>sum+Buffer.byteLength(packet.snapshot),0),randomClosest:random.stages.length,details:packets.map(packet=>({date:packet.date,number:packet.number,stages:(JSON.parse(packet.snapshot) as Snapshot).stages.map(({scores,...stage})=>stage)}))};
    if(!apply){mkdirSync('data',{recursive:true});writeFileSync(reviewPath,JSON.stringify(review,null,2));console.log(JSON.stringify({...review,details:undefined,review:reviewPath},null,2));return;}
    const approved=process.argv[process.argv.indexOf('--approve')+1];
    if(approved!==approvalHash||prior.approvalHash!==approvalHash)throw Error('Hash preview tidak sesuai.');
    const backup=resolve('backups',`pre-year-end-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);mkdirSync('backups',{recursive:true});
    writeFileSync(backup,JSON.stringify({daily:store.sqlite.prepare('SELECT date,number,demo,published_at FROM daily ORDER BY date').all(),runs:store.sqlite.prepare('SELECT * FROM runs').all(),answers:store.sqlite.prepare('SELECT * FROM answers').all(),pool:store.sqlite.prepare('SELECT * FROM random_pool').all(),scoringRef,approvalHash}));
    const result=publishSchedule(store,packets,scoringRef,random);
    writeFileSync(resolve('data/daily-year-end-published.json'),JSON.stringify({...review,details:undefined,...result,backup,publishedAt:new Date().toISOString(),today:wibDate()},null,2));
    console.log(JSON.stringify({...result,first:review.first,last:review.last,days:review.days,backup},null,2));
  }finally{store.sqlite.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
