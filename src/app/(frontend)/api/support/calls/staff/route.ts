import {NextResponse} from 'next/server';
import {supportAuth} from '@/server/support/auth';
import {callAction,callRead,runCallMaintenance} from '@/server/support/callService';
import {checkOrigin,limitedJSON,failure} from '@/server/content/auth';
export const runtime='nodejs';
export async function GET(req:Request){try{const {p,user}=await supportAuth(req.headers);return NextResponse.json(await callRead(p,{user},new URL(req.url).searchParams.get('conversation')),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(req:Request){try{checkOrigin(req);const {p,user}=await supportAuth(req.headers);const result=await callAction(p,{user},await limitedJSON(req,110000));if(Number.isInteger(result?.id))await runCallMaintenance(p,result.id).catch(()=>{});return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
