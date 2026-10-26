import {describe,it,expect,vi,afterEach} from 'vitest';
import sharp from 'sharp';
import {renderLiveCard,type LiveCard} from '../apps/api/src/discord-card.js';
const card:LiveCard={date:'2026-10-24',number:3,activeCount:2,players:[{id:'123456789',name:'Hafizh',avatar:null,stages:2,completed:false,label:'Daily #003',score:null,active:true},{id:'234567890',name:'Rani',avatar:null,stages:5,completed:true,label:'Daily #003',score:4845,stageScores:[1000,950,975,970,950],active:true}]};
afterEach(()=>vi.unstubAllGlobals());
describe('Discord progress card',()=>{
  it('renders a PNG with names and progress, while hiding unfinished scores',async()=>{
    const image=await renderLiveCard(card);const meta=await sharp(image).metadata();
    expect(meta).toMatchObject({format:'png',width:960,height:392});
    const altered=structuredClone(card);altered.players[0].score=999;
    expect(await renderLiveCard(altered)).toEqual(image);
    altered.players[1].score=4000;expect(await renderLiveCard(altered)).not.toEqual(image);
  });
  it('shades each completed block by its own score on a fixed scale',async()=>{
    const input=structuredClone(card);input.players[1].stageScores=[0,250,500,750,1000];
    const {data,info}=await sharp(await renderLiveCard(input)).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const pixel=(stage:number)=>{const offset=(257*info.width+487+stage*45)*info.channels;return [...data.subarray(offset,offset+3)];};
    expect([0,1,2,3,4].map(pixel)).toEqual([[33,69,52],[53,107,79],[73,145,106],[92,182,133],[112,220,160]]);
    input.players[0].stageScores=[0,1000];const first=await renderLiveCard(input);
    input.players[0].stageScores=[1000,0];expect(await renderLiveCard(input)).toEqual(first);
  });
  it('escapes profile names and bounds progress for valid images',async()=>{
    const input=structuredClone(card);input.players[0].name='<image href="https://example.com/">&';input.players[0].stages=999;
    expect((await sharp(await renderLiveCard(input)).metadata()).width).toBe(960);
  });
  it('embeds avatars from the fixed Discord CDN and caches each avatar',async()=>{
    const avatar=await sharp({create:{width:64,height:64,channels:4,background:'#4499ff'}}).png().toBuffer();
    const fetcher=vi.fn(async(_input:string)=>new Response(new Uint8Array(avatar).buffer,{headers:{'content-type':'image/png'}}));vi.stubGlobal('fetch',fetcher);
    const input=structuredClone(card);input.players[0].avatar='abcdef012345';
    const first=await renderLiveCard(input);const second=await renderLiveCard(input);
    expect(first).toEqual(second);expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://cdn.discordapp.com/avatars/123456789/abcdef012345.png?size=64');
  });
});
