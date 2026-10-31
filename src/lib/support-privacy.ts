/** Conservative heuristic, not a claim of complete personal-data detection.
 * Ordinary service dates, dimensions, counts and budgets are allowed.
 * Contact/credential/address cues and long identifier-like numbers require staff.
 */
export function requiresPrivateHandling(value:string){
 const text=value.normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0));
 if(/@|https?:|www\.|\b(address|street|road|lane|avenue|passport|password|phone|whatsapp|wechat|pin|iban)\b|access[ -]?code|door[ -]?code|gate[ -]?code|地址|住在|家住|门禁|密码|证件|护照|微信|电话|住址|(?:街|路|弄|栋|单元|室)\s*\d|\d+\s*(?:号|栋|单元|室)|direcci[oó]n|calle|contrase[nñ]a|tel[eé]fono|adresse|\brue\b|mot de passe|t[eé]l[eé]phone|straße|strasse|passwort|telefon|indirizzo|\bvia\b|codice|telefono|عنوان|شارع|رمز|هاتف/iu.test(text))return true;
 const withoutDates=text.replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g,'').replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/g,'');
 return /(?:\d[ ()-]*){7,}/u.test(withoutDates)||/\b[A-Z]{1,3}\d{6,}\b/i.test(withoutDates);
}
