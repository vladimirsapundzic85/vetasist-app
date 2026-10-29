// PGLITE_MODULE points to an externally installed @electric-sql/pglite entrypoint.
// No production Supabase connection is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('SQL denies public access and enforces single execution/idempotency constraints', { skip: !process.env.PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.PGLITE_MODULE);
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(await readFile(new URL('../sql/airs-check-jobs.sql', import.meta.url), 'utf8'));
    const rls = await db.query("select relrowsecurity from pg_class where relname='airs_check_jobs'");
    assert.equal(rls.rows[0].relrowsecurity, true);
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      await assert.rejects(db.query('select * from public.airs_check_jobs'), /permission denied/);
      await assert.rejects(db.query("insert into public.airs_check_jobs (org_id) values ('x')"), /permission denied/);
      await db.exec('reset role');
    }
    const insert = async (org, device, ref) => db.query("insert into public.airs_check_jobs(org_id,device_id,request_ref,animal_ids,tool_code,expires_at) values ($1,$2,$3,'[\"7100000001\"]','goveda_pregled_kretanja',now()+interval '15 minutes') returning id", [org,device,ref]);
    await db.exec('set role service_role');
    const id = (await insert('org1','device1','test1')).rows[0].id;
    await assert.rejects(insert('org1','device1','test2'), /duplicate key/);
    const claim = () => db.query("update public.airs_check_jobs set status='running' where id=$1 and status='queued' returning id", [id]);
    const claimed = await Promise.all([claim(), claim()]);
    assert.equal(claimed.reduce((sum,r) => sum+r.rows.length, 0), 1);
    await db.query("update public.airs_check_jobs set status='completed' where id=$1", [id]);
    await assert.rejects(insert('org1','device1','test1'), /duplicate key/);
    await insert('org1','device1','test2');
    await insert('org2','device1','test1');
  } finally { await db.close(); }
});
