import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {getPayload} from 'payload';
import config from '@/payload.config';
import {isActiveStaff} from '@/cms/access';
import WorkflowDesk from '@/components/workflow/WorkflowDesk';
export const dynamic='force-dynamic';
export default async function Page(){
  const p=await getPayload({config});
  const {user}=await p.auth({headers:await headers()});
  if(user?.collection!=='staff'||!isActiveStaff(user))redirect('/admin/login');
  return <WorkflowDesk/>;
}
