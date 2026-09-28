import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Postgres enforces owner isolation, safe updates, recoverable archives, and constraints', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
    `);
    const sql = await readFile(new URL('../../../supabase/migrations/20260928042754_private_lineup_scenarios.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    const as = async (user) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
      await db.exec('set role authenticated');
    };
    const owner = '11111111-1111-4111-8111-111111111111';
    const stranger = '22222222-2222-4222-8222-222222222222';
    await as(owner);
    const insert = `insert into public.lineup_scenarios(name,season,match_id,home_team_name,away_team_name,home_player_ids,away_player_ids,home_player_names,away_player_names) values ('Strongest XI','2026-2027','fixture-1','Home','Away',array[1,2,3,4,5,6,7,8,9,10,11],array[12,13,14,15,16,17,18,19,20,21,22],array_fill('Home player'::text,array[11]),array_fill('Away player'::text,array[11])) returning id,user_id,version`;
    const { rows: [saved] } = await db.query(insert);
    assert.equal(saved.user_id, owner);
    assert.equal(saved.version, 1);
    await as(stranger);
    assert.equal((await db.query('select * from public.lineup_scenarios')).rows.length, 0);
    assert.equal((await db.query("update public.lineup_scenarios set name='Stolen' where id=$1 returning id", [saved.id])).rows.length, 0);
    assert.equal((await db.query('update public.lineup_scenarios set archived_at=now() where id=$1 returning id', [saved.id])).rows.length, 0);
    await assert.rejects(db.query('update public.lineup_scenarios set user_id=$1 where id=$2', [stranger, saved.id]), /permission denied/);
    await assert.rejects(db.query("insert into public.lineup_scenarios(user_id,name) values ($1,'Spoof')", [owner]), /permission denied/);
    await as(owner);
    assert.equal((await db.query('select * from public.lineup_scenarios')).rows.length, 1);
    await assert.rejects(db.query('delete from public.lineup_scenarios where id=$1', [saved.id]), /permission denied/);
    const { rows: [archived] } = await db.query('update public.lineup_scenarios set archived_at=now() where id=$1 and version=1 returning version,archived_at', [saved.id]);
    assert.equal(archived.version, 2); assert.ok(archived.archived_at);
    assert.equal((await db.query("update public.lineup_scenarios set name='Stale change' where id=$1 and version=1 returning id", [saved.id])).rows.length, 0);
    const { rows: [restored] } = await db.query("update public.lineup_scenarios set archived_at=null, name='Restored' where id=$1 and version=2 returning *", [saved.id]);
    assert.equal(restored.version, 3); assert.equal(restored.archived_at, null); assert.equal(restored.name, 'Restored');
    await assert.rejects(db.query(insert.replace('array[1,2,3,4,5,6,7,8,9,10,11]', 'array[1,1,1,1,1,1,1,1,1,1,1]')), /check constraint/);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from public.lineup_scenarios'), /permission denied/);
    // Even with accidental broader column grants, the RLS ownership checks hold.
    await db.exec('reset role; grant update(user_id), insert(user_id) on public.lineup_scenarios to authenticated;');
    await as(owner);
    await assert.rejects(db.query('update public.lineup_scenarios set user_id=$1 where id=$2', [stranger, saved.id]), /row-level security/);
    await as(stranger);
    await assert.rejects(db.query(insert.replace('(name,', '(user_id,name,').replace("values ('Strongest", `values ('${owner}','Strongest`)), /row-level security/);
  } finally { await db.close(); }
});
