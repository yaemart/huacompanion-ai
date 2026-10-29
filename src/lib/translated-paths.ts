import {locales,type Locale} from './locales.ts';
import type {ContentBody} from './content-model.ts';
export function translatedPaths(current:ContentBody, published:ContentBody[]):Record<Locale,string|null> {
  return Object.fromEntries(locales.map(locale=>{
    const item=published.find(d=>d.locale===locale && d.kind===current.kind && d.contentKey===current.contentKey);
    if(!item)return [locale,null];
    const prefix=item.kind==='institution'?'institutions':item.kind==='exhibition'?'exhibitions':item.kind==='provider-profile'?'providers':item.kind==='service-project'?'services/projects':item.kind==='service'?'services':item.kind==='guide'?'guides':item.kind==='partner'?'partners':'';
    return [locale,`/${locale}/${prefix ? prefix+'/' : ''}${item.slug==='home' && item.kind==='page' ? '' : item.slug}`];
  })) as Record<Locale,string|null>;
}
