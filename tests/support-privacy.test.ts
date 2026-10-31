import test from 'node:test';import assert from 'node:assert/strict';
import {requiresPrivateHandling} from '../src/lib/support-privacy.ts';
test('business dates, counts, dimensions and budgets remain usable',()=>{for(const s of ['2026-11-02, 3 people, budget CNY 2000','80平方米，2个房间，预算500元，11月2日','2 personas, presupuesto 200 euros','موعد ٢٠٢٦-١١-٠٢، ٣ أشخاص'])assert.equal(requiresPrivateHandling(s),false,s);});
test('contact, credential and specific address cues trigger private handling',()=>{for(const s of ['My address is 12 King Street, door code 9876','email me at a@example.com','+86 138 1234 5678','passport number AB1234567','门禁密码是蓝色','上海市某路8号','رقم الهاتف ١٣٨١٢٣٤٥٦٧٨','contraseña azul','mot de passe secret'])assert.equal(requiresPrivateHandling(s),true,s);});
