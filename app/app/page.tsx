'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

type Org = { id: string; name: string }
type Sub = { org_id: string; plan_id: string; status: string; valid_until: string | null }
type Plan = { id: string; name: string; price_eur: number; seats: number; max_sessions_per_user: number }

export default function Home() {
  const [email, setEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [orgs, setOrgs] = useState<Org[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)

  const [plans, setPlans] = useState<Plan[]>([])
  const [sub, setSub] = useState<Sub | null>(null)

  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const isAuthed = useMemo(() => !!userId, [userId])

  async function refreshSession() {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error

    const u = data.session?.user ?? null
    setEmail(u?.email ?? null)
    setUserId(u?.id ?? null)
  }

  async function loadPlans() {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('price_eur', { ascending: true })

    if (error) throw error
    setPlans((data as Plan[]) ?? [])
  }

  // ✅ Učitaj orgs preko org_members (samo moje), ne direktno iz organizations.
  async function loadOrgs(currentUserId: string) {
    const { data, error } = await supabase
      .from('org_members')
      .select('org_id, organizations ( id, name )')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const list: Org[] =
      (data ?? [])
        .map((row: any) => row.organizations)
        .filter(Boolean)
        .map((o: any) => ({ id: o.id as string, name: o.name as string })) ?? []

    setOrgs(list)

    // Ako aktivna nije setovana, uzmi prvu.
    if (!activeOrgId && list.length) setActiveOrgId(list[0].id)

    // Ako je aktivna obrisana / više nije moja, resetuj.
    if (activeOrgId && list.length && !list.some((o) => o.id === activeOrgId)) {
      setActiveOrgId(list[0].id)
    }
    if (activeOrgId && list.length === 0) {
      setActiveOrgId(null)
    }
  }

  async function loadSub(orgId: string) {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle()

    if (error) throw error
    setSub((data as Sub) ?? null)
  }

  useEffect(() => {
    ;(async () => {
      try {
        setErr(null)
        await refreshSession()
        await loadPlans()
      } catch (e: any) {
        setErr(e?.message ?? String(e))
      }
    })()

    const { data: subAuth } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null)
      setUserId(session?.user?.id ?? null)
    })

    return () => {
      subAuth.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Kad dobijemo userId, učitaj orgs
  useEffect(() => {
    if (!userId) {
      setOrgs([])
      setActiveOrgId(null)
      setSub(null)
      return
    }

    ;(async () => {
      try {
        setErr(null)
        await loadOrgs(userId)
      } catch (e: any) {
        setErr(e?.message ?? String(e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Kad se promeni aktivna org, učitaj subscription
  useEffect(() => {
    if (!activeOrgId) {
      setSub(null)
      return
    }

    ;(async () => {
      try {
        setErr(null)
        await loadSub(activeOrgId)
      } catch (e: any) {
        setErr(e?.message ?? String(e))
      }
    })()
  }, [activeOrgId])

  async function createOrg() {
    const name = orgName.trim()
    if (!name) return

    setLoading(true)
    setErr(null)
    setMsg(null)

    try {
      const { data: me, error: meErr } = await supabase.auth.getUser()
      if (meErr) throw meErr
      const uid = me.user?.id
      if (!uid) throw new Error('Nisi ulogovan.')

      // 1) create org
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({ name })
        .select('id,name')
        .single()

      if (orgErr) throw orgErr

      const orgId = (org as Org).id

      // 2) add me as owner
      const { error: memErr } = await supabase.from('org_members').insert({
        org_id: orgId,
        user_id: uid,
        role: 'owner'
      })
      if (memErr) throw memErr

      // 3) create inactive subscription row
      const { error: subErr } = await supabase.from('subscriptions').insert({
        org_id: orgId,
        plan_id: 'basic',
        status: 'inactive',
        valid_until: null
      })
      if (subErr) throw subErr

      setOrgName('')
      setMsg(`Organizacija kreirana: ${(org as Org).name}`)

      // refresh orgs from membership
      await loadOrgs(uid)
      setActiveOrgId(orgId)
      await loadSub(orgId)
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    setLoading(true)
    setErr(null)
    setMsg(null)
    const { error } = await supabase.auth.signOut()
    setLoading(false)
    if (error) setErr(error.message)
  }

  return (
    <main style={{ padding: 20, maxWidth: 900 }}>
      <h1>VetAsist — Licenca (MVP)</h1>

      <div style={{ margin: '12px 0' }}>
        {email ? (
          <>
            <span>
              Ulogovan: <b>{email}</b>
            </span>
            <button onClick={logout} disabled={loading} style={{ marginLeft: 10 }}>
              Logout
            </button>
          </>
        ) : (
          <span>
            Nisi ulogovan. Idi na <a href="/auth">/auth</a>
          </span>
        )}
      </div>

      {msg && <p style={{ color: 'green' }}>{msg}</p>}
      {err && <p style={{ color: 'crimson' }}>Greška: {err}</p>}

      <hr />

      <h2>Kreiraj organizaciju</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Naziv organizacije…"
          style={{ flex: 1, padding: 8 }}
          disabled={!isAuthed || loading}
        />
        <button onClick={createOrg} disabled={!isAuthed || loading}>
          {loading ? 'Kreiram…' : 'Kreiraj'}
        </button>
      </div>

      <hr />

      <h2>Moje organizacije</h2>
      {orgs.length === 0 ? (
        <p>Nema organizacija još. Kreiraj prvu.</p>
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {orgs.map((o) => (
            <button
              key={o.id}
              onClick={() => setActiveOrgId(o.id)}
              style={{
                padding: '8px 10px',
                border: activeOrgId === o.id ? '2px solid black' : '1px solid #ccc',
                background: activeOrgId === o.id ? '#eee' : 'white',
                cursor: 'pointer'
              }}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}

      <hr />

      <h2>Planovi</h2>
      <ul>
        {plans.map((p) => (
          <li key={p.id}>
            <b>{p.name}</b> — €{p.price_eur}/mes • seats: {p.seats} • sessions/user: {p.max_sessions_per_user}
          </li>
        ))}
      </ul>

      <h2>Licenca (za izabranu organizaciju)</h2>
      {!activeOrgId ? (
        <p>Izaberi organizaciju.</p>
      ) : !sub ? (
        <p>Nema subscription reda (ovo ne bi trebalo da se desi ako je org kreiran iz aplikacije).</p>
      ) : (
        <div>
          <p>
            <b>Status:</b> {sub.status}
          </p>
          <p>
            <b>Plan:</b> {sub.plan_id}
          </p>
          <p>
            <b>Valid until:</b> {sub.valid_until ?? 'n/a'}
          </p>
        </div>
      )}

      <hr />

      <p style={{ opacity: 0.8 }}>
        Sledeće: “Activate license” (manual admin) + session limit + endpoint za skripte da proveri status licence.
      </p>
    </main>
  )
}
