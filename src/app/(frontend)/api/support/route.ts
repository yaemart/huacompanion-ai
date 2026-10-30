import {NextResponse} from 'next/server';
import {cookieName,visitorSession,supportPayload} from '@/server/support/auth';
import {visitorAction,visitorRead} from '@/server/support/service';
import {checkOrigin,limitedJSON,failure} from '@/server/content/auth';
import {IntakeValidationError} from '@/lib/intake-validation';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
export async function GET(req:Request){try{const s=visitorSession(req.headers);if(!s.hash)return NextResponse.json({conversations:[]},{headers});return NextResponse.json(await visitorRead(await supportPayload(),s.hash,new URL(req.url).searchParams.get('id')),{headers});}catch(e){return failure(e);}}
export async function POST(req:Request){try{checkOrigin(req);const input=await limitedJSON(req,32768);const s=visitorSession(req.headers,input.action==='start');const result=await visitorAction(await supportPayload(),s.hash,input);const response=NextResponse.json(result,{headers});if(s.fresh)response.cookies.set(cookieName,s.token,{httpOnly:true,secure:new URL(process.env.APP_URL!).protocol==='https:',sameSite:'strict',path:'/',maxAge:60*60*24*30});return response;}catch(e){if(e instanceof IntakeValidationError)return NextResponse.json({error:'Please check your information',fields:e.errors},{status:400,headers});return failure(e);}}
