import {supportAuth} from '@/server/support/auth';
import {checkOrigin,limitedJSON,failure} from '@/server/content/auth';
import {businessRead,businessAction} from '@/server/business/service';
export const runtime='nodejs';
export async function GET(req:Request){try{const {p,user}=await supportAuth(req.headers);return Response.json(await businessRead(p,user,new URL(req.url).searchParams.get('id')),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(req:Request){try{checkOrigin(req);const {p,user}=await supportAuth(req.headers);return Response.json(await businessAction(p,user,await limitedJSON(req,50000)),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
