import { readdir, stat, unlink } from 'node:fs/promises';
import { resolve, basename } from 'node:path';

/** Only completed Nyambung backups are managed; partial and unrelated files stay. */
export async function pruneBackups(directory:string,completed:string){
  const root=resolve(directory),current=resolve(completed);
  const managed=(name:string)=>/^nyambung-[\w.-]+\.sqlite(?:\.gz)?$/.test(name);
  if(resolve(root,basename(current))!==current || !managed(basename(current)))throw new Error('Path backup tidak valid.');
  if(!(await stat(current)).isFile() || (await stat(current)).size===0)throw new Error('Backup baru belum siap; backup lama dipertahankan.');
  const entries=await readdir(root,{withFileTypes:true});
  const files=await Promise.all(entries.filter(entry=>entry.isFile()&&managed(entry.name)).map(async entry=>{const path=resolve(root,entry.name);return {path,...await stat(path)};}));
  files.sort((a,b)=>b.mtimeMs-a.mtimeMs||b.path.localeCompare(a.path));
  const retained=files[0].path;let freed=0,removed=0;
  for(const file of files.slice(1)){await unlink(file.path);freed+=file.size;removed++;}
  return {retained,freed,removed};
}
