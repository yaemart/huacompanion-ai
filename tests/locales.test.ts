import {test} from 'node:test';
import assert from 'node:assert/strict';
import {locales,isLocale,localeDirection} from '../src/lib/locales.ts';
import {switchLocale} from '../src/lib/routes.ts';
import {coreTranslations} from '../src/lib/core-copy.ts';
test('seven locale routes preserve deep paths and enquiry context',()=>{
 for(const from of locales)for(const to of locales)assert.equal(switchLocale(`/${from}/request?project=hua-project-arrival&city=shanghai#details`,to),`/${to}/request?project=hua-project-arrival&city=shanghai#details`);
 assert.equal(isLocale('ja'),false); assert.equal(isLocale(null),false);
 assert.equal(localeDirection('ar'),'rtl'); assert.equal(localeDirection('fr'),'ltr');
});
test('core interface translations cover every supported locale',()=>{
 for(const row of Object.values(coreTranslations))for(const locale of locales)assert.ok(row[locale]?.trim());
});

test('translated detail links resolve by identity instead of assuming identical slugs',async()=>{
 const {translatedPaths}=await import('../src/lib/translated-paths.ts');
 const original={kind:'guide',contentKey:'preparation',locale:'en',slug:'prepare'} as any;
 const french={...original,locale:'fr',slug:'preparer'};
 const links=translatedPaths(original,[original,french,{...french,contentKey:'other',locale:'de'}]);
 assert.equal(links.fr,'/fr/guides/preparer');
 assert.equal(links.de,null); assert.equal(links.ar,null);
});
