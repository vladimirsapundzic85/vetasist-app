'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Org = {
  id: string
  name: string
}

type Sub = {
  plan_id: string
  status: string
  valid_until: string | null
}

type License = {
  license_key: string
  is_active: boolean
  plan: string
}

type OrgMemberRow = {
  org_id: string
  organizations: { id: string; name: string }[] | { id: string; name: string } | null
}

export default function OwnerDashboard() {
  const [email, setEmail] = useState<string | null>(null)

  const [org, setOrg] = useState<Org | null>(null)
  const [subscription, setSubscription] = useState<Sub | null>(null)
  const [license, setLicense] = useState<License | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadSession() {
    const { data, error } = await supabase.auth.getSession()

    if (error) throw error

    const user = data.session?.user ?? null
    setEmail(user?.email ?? null)

    return user?.id ?? null
  }

  function normalizeOrganization(value: OrgMemberRow['organizations']): Org | null {
    if (!value) return null

    if (Array.isArray(value)) {
      if (!value.length) return null
      return {
        id: String(value[0].id),
        name: String(value[0].name),
      }
    }

    return {
      id: String(value.id),
      name: String(value.name),
    }
  }

  async function loadOrg(userId: string) {
    const { data, error } = await supabase
      .from('org_members')
      .select('org_id, organizations(id,name)')
      .eq('user_id', userId)
      .limit(1)
      .single<OrgMemberRow>()

    if (error) throw error

    const normalizedOrg = normalizeOrganization(data.organizations)

    if (!normalizedOrg) {
      throw new Error('Nije pronađena organizacija za ovaj nalog.')
    }

    setOrg(normalizedOrg)

    return normalizedOrg.id
  }

  async function loadSubscription(orgId: string) {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan_id,status,valid_until')
      .eq('org_id', orgId)
      .maybeSingle()

    if (error) throw error

    setSubscription((data as Sub | null) ?? null)
  }

  async function loadLicense(orgId: string) {
    const { data, error } = await supabase
      .from('license_keys')
      .select('license_key,is_active,plan')
      .eq('org_id', orgId)
      .maybeSingle()

    if (error) throw error

    setLicense((data as License | null) ?? null)
  }

  async function init() {
    try {
      setLoading(true)
      setError(null)

      const uid = await loadSession()

      if (!uid) {
        setOrg(null)
        setSubscription(null)
        setLicense(null)
        return
      }

      const orgId = await loadOrg(uid)

      await loadSubscription(orgId)
      await loadLicense(orgId)
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error')
      setOrg(null)
      setSubscription(null)
      setLicense(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    init()

    const { data } = supabase.auth.onAuthStateChange(() => {
      init()
    })

    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  async function logout() {
    await supabase.auth.signOut()
  }

  if (loading) {
    return (
      <main style={{ padding: 40 }}>
        <h2>Loading...</h2>
      </main>
    )
  }

  return (
    <main style={{ padding: 40, maxWidth: 900 }}>
      <h1>VetAssist — Owner Panel</h1>

      {email ? (
        <div style={{ marginBottom: 20 }}>
          Ulogovan: <b>{email}</b>
          <button onClick={logout} style={{ marginLeft: 10 }}>
            Logout
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          Nisi ulogovan. Idi na <a href="/app/auth">/app/auth</a>
        </div>
      )}

      {error && <p style={{ color: 'red' }}>Greška: {error}</p>}

      <hr />

      <h2>Organizacija</h2>

      {org ? (
        <p>
          <b>{org.name}</b>
        </p>
      ) : (
        <p>Nema organizacije povezane sa ovim nalogom.</p>
      )}

      <hr />

      <h2>Licenca</h2>

      {license ? (
        <div>
          <p>
            <b>License key:</b>
            <br />
            <code>{license.license_key}</code>
          </p>

          <p>
            <b>Plan:</b> {license.plan}
          </p>

          <p>
            <b>Aktivna:</b> {license.is_active ? 'DA' : 'NE'}
          </p>
        </div>
      ) : (
        <p>Nema licence za ovu organizaciju.</p>
      )}

      <hr />

      <h2>Pretplata</h2>

      {subscription ? (
        <div>
          <p>
            <b>Status:</b> {subscription.status}
          </p>

          <p>
            <b>Plan:</b> {subscription.plan_id}
          </p>

          <p>
            <b>Valid until:</b> {subscription.valid_until ?? 'nema'}
          </p>
        </div>
      ) : (
        <p>Nema subscription zapisa.</p>
      )}

      <hr />

      <h2>Sledeći koraci</h2>

      <ul>
        <li>upravljanje uređajima</li>
        <li>reset uređaja</li>
        <li>istorija resetova</li>
        <li>promena plana</li>
        <li>uputstvo za instalaciju ekstenzije</li>
      </ul>
    </main>
  )
}
