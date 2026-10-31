import {configuredBusinessAIAdapter,runBusinessAIJob} from '../src/server/business/ai';
import {runQualityReview} from '../src/server/quality/service';
import 'dotenv/config';
import {getPayload} from 'payload';
import config from '../src/payload.config';
import {runWorkflowJobs} from '../src/server/workflow/service';
const p=await getPayload({config});let stopped=false;process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
try{do{try{await runQualityReview(p);console.log(await runWorkflowJobs(p));await runBusinessAIJob(p,configuredBusinessAIAdapter());}catch(e){console.error('Workflow worker failed safely',e instanceof Error?e.name:'Error');if(process.argv.includes('--once'))throw e;}if(process.argv.includes('--once'))break;await new Promise(resolve=>setTimeout(resolve,30000));}while(!stopped);}finally{await p.destroy();}process.exit(0);
