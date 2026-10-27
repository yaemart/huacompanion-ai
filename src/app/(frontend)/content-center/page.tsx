import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {contentAuth} from '@/server/content/auth';
import {ContentCenter} from '@/components/content/ContentCenter';
export const dynamic='force-dynamic';
export const metadata={title:'内容工作台 · 华伴',robots:{index:false,follow:false}};
export default async function Page(){try{await contentAuth(await headers())}catch{redirect('/admin/login')}return <ContentCenter/>}
