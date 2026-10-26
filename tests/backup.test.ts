import {it,expect} from 'vitest';
import {mkdtemp,writeFile,readdir,rm,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pruneBackups} from '../scripts/backup-retention.js';

it('retains one completed backup and preserves partial backups and unrelated files',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'nyambung-backups-'));
  try{
    const old=join(directory,'nyambung-old.sqlite.gz'),current=join(directory,'nyambung-new.sqlite.gz');
    await writeFile(old,'old');await utimes(old,new Date(0),new Date(0));
    await writeFile(current,'new');await writeFile(join(directory,'notes.txt'),'keep');await writeFile(join(directory,'nyambung-next.sqlite.gz.partial'),'working');
    const result=await pruneBackups(directory,current);expect(result.removed).toBe(1);expect(result.retained).toBe(current);
    expect((await readdir(directory)).sort()).toEqual(['notes.txt','nyambung-new.sqlite.gz','nyambung-next.sqlite.gz.partial']);
  }finally{await rm(directory,{recursive:true,force:true});}
});
it('keeps all existing backups if the new backup is missing or empty',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'nyambung-backups-fail-'));
  try{
    await writeFile(join(directory,'nyambung-old.sqlite'),'valid');
    await expect(pruneBackups(directory,join(directory,'nyambung-missing.sqlite.gz'))).rejects.toThrow();
    const empty=join(directory,'nyambung-empty.sqlite.gz');await writeFile(empty,'');
    await expect(pruneBackups(directory,empty)).rejects.toThrow();
    expect(await readdir(directory)).toContain('nyambung-old.sqlite');
  }finally{await rm(directory,{recursive:true,force:true});}
});
