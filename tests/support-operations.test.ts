import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('support operations preserve scope and require explicit retention confirmation',()=>{const result=spawnSync(process.execPath,['--import','tsx','tests/integration/support-operations.ts'],{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr||result.stdout);assert.match(result.stdout,/PASS support operations/);});
