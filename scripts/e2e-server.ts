import { createDiscordService } from '../apps/api/src/discord.js';
import { createMabar } from '../apps/api/src/mabar.js';
import { attachMabar } from '../apps/api/src/mabar-ws.js';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { resolve } from 'node:path';
import { openDatabase } from '../apps/api/src/db.js';
import { createApp } from '../apps/api/src/app.js';
import { compilePackets, publish, compileRandomPool, publishRandomPool } from './content.js';
import { addDays, wibDate } from '../apps/api/src/time.js';
const store = openDatabase(':memory:');
publish(store, compilePackets(store, wibDate(), true));
publish(store, compilePackets(store, addDays(wibDate(),-14), true));
publishRandomPool(store, compileRandomPool(store, true), true);
let timeOffset=0;
const mabar=process.env.MABAR_ENABLED==='true'?createMabar(store,()=>Date.now()+timeOffset):undefined;
// Fake only Discord's upstream API; the application's auth, room and sockets stay real.
const applicationId='111111111111111111',guildId='222222222222222222';
const people={alice:'444444444444444444',bob:'555555555555555555'};
const discord=mabar?createDiscordService(store,{applicationId,guildId,clientSecret:'e2e',publicKey:'0'.repeat(64),botToken:'e2e',publicOrigin:'http://127.0.0.1:4173'},()=>new Date(),async(input,init)=>{
 const path=new URL(String(input)).pathname.replace('/api/v10','');
 if(path==='/oauth2/token'){const code=new URLSearchParams(String(init?.body)).get('code');return Response.json({access_token:code,expires_in:3600});}
 if(path==='/oauth2/@me')return Response.json({application:{id:applicationId},scopes:['identify','rpc.activities.write']});
 if(path==='/users/@me'){const person=(init?.headers as Record<string,string>)?.Authorization?.endsWith('bob')?'bob':'alice';return Response.json({id:people[person],username:person==='alice'?'Alice':'Bob',avatar:null});}
 if(path.includes('/activity-instances/'))return Response.json({application_id:applicationId,instance_id:path.split('/').at(-1),location:{guild_id:guildId,channel_id:'333333333333333333'},users:Object.values(people)});
 return Response.json({error:'Unsupported fake Discord endpoint'}, {status:404});
}):undefined;
const app = createApp(store,undefined,{mabar,discord});
if(mabar)app.post('/api/mabar-test/advance',async c=>{const {milliseconds}=await c.req.json();timeOffset+=milliseconds;mabar.tick();return c.json({ok:true});});
app.use('*', serveStatic({ root: resolve('apps/web/dist') }));
app.use('*', serveStatic({ path: resolve('apps/web/dist/index.html') }));
const server=serve({ fetch: app.fetch, port: 4173, hostname: '127.0.0.1' });
if(mabar)attachMabar(server as import('node:http').Server,mabar,['http://127.0.0.1:4173']);
