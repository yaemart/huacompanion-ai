import {supportAuth} from '@/server/support/auth';
import {checkOrigin,limitedJSON,failure} from '@/server/content/auth';
import {linkCustomerInquiry,revokeCustomerInquiry} from '@/server/customer/service';
export const runtime='nodejs';
export async function POST(req:Request){try{checkOrigin(req);const input=await limitedJSON(req,4096);const {p,user}=await supportAuth(req.headers);return Response.json(await(input.action==='revoke'?revokeCustomerInquiry(p,user,input):linkCustomerInquiry(p,user,input)),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
