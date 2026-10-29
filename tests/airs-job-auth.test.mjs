import test from 'node:test';
import assert from 'node:assert/strict';
import { automationScope, requireController } from '../app/lib/airs-job-auth.ts';
test('remote execution defaults off; controller token and scope are mandatory', () => {
  const names = ['AIRS_AUTOMATION_ENABLED','AIRS_AUTOMATION_ORG_ID','AIRS_AUTOMATION_DEVICE_ID','AIRS_AUTOMATION_CONTROL_TOKEN'];
  const old = Object.fromEntries(names.map(k => [k, process.env[k]]));
  try {
    for (const key of names) delete process.env[key];
    assert.throws(automationScope, /automation_disabled/);
    process.env.AIRS_AUTOMATION_ENABLED='true'; process.env.AIRS_AUTOMATION_ORG_ID='test-org'; process.env.AIRS_AUTOMATION_DEVICE_ID='test-device';
    const req = token => new Request('https://backend.test/api/automation/mcp', { headers: token ? { authorization: 'Bearer '+token } : {} });
    assert.throws(() => requireController(req()), /unauthorized/);
    process.env.AIRS_AUTOMATION_CONTROL_TOKEN='test-token-'.repeat(4);
    assert.throws(() => requireController(req('wrong')), /unauthorized/);
    assert.doesNotThrow(() => requireController(req(process.env.AIRS_AUTOMATION_CONTROL_TOKEN)));
    assert.throws(() => requireController(new Request('https://backend.test/api/automation/mcp', { headers: { authorization: 'Bearer '+process.env.AIRS_AUTOMATION_CONTROL_TOKEN, origin: 'https://foreign.test' } })), /origin_denied/);
    delete process.env.AIRS_AUTOMATION_DEVICE_ID;
    assert.throws(automationScope, /automation_disabled/);
  } finally { for (const key of names) { if (old[key] === undefined) delete process.env[key]; else process.env[key]=old[key]; } }
});
