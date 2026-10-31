import 'dotenv/config';
import {getPayload} from 'payload';
import config from '../src/payload.config';
import {runVoiceJob} from '../src/server/support/voice-jobs';
import {runCallMaintenance} from '../src/server/support/callService';
import {configuredAdapter,runSupportJob} from '../src/server/support/agent';
const p=await getPayload({config});let stopped=false;process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
const once=process.argv.includes('--once');
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function loop(work:()=>Promise<unknown>,delay:number){
 do{try{await work();}catch(e){console.error('Support worker failed safely:',e instanceof Error?e.name:'Error');if(once)throw e;}
 if(!once&&!stopped)await pause(delay);
 }while(!stopped&&!once);
}
try{
 const adapter=configuredAdapter();
 console.log(adapter?'Support worker: configured AI gateway':'Support worker: AI unavailable; human fallback enabled');
 // Separate loops keep slow model/speech responses from delaying call expiry checks.
 const results=await Promise.allSettled([
  loop(()=>runSupportJob(p,adapter),2000),
  loop(()=>runVoiceJob(p),2000),
  loop(()=>runCallMaintenance(p),2000),
 ]);
 for(const result of results)if(result.status==='rejected')throw result.reason;
}finally{await p.destroy();}process.exit(0);
