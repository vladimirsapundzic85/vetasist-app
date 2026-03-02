'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // initial session
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email ?? null)
    })

    // listen changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  function readCreds() {
    const e = email.trim()
    const p = password.trim()
    return { e, p }
  }

  async function signUp() {
    const { e, p } = readCreds()

    if (!e || !p) {
      setMsg('Upiši email i lozinku. (Autofill ponekad ne okine React state.)')
      return
    }

    setLoading(true)
    setMsg(null)

    const res = await supabase.auth.signUp({ email: e, password: p })
    console.log('SIGNUP RES:', res)

    setLoading(false)

    if (res.error) {
      setMsg(res.error.message)
      return
    }

    // Confirm email ti je uključen u Supabase-u, pa je ovo normalno ponašanje
    setMsg('Signup OK. Proveri email i potvrdi nalog (Confirm email je uključen).')
  }

  async function signIn() {
    const { e, p } = readCreds()

    if (!e || !p) {
      setMsg('Upiši email i lozinku.')
      return
    }

    setLoading(true)
    setMsg(null)

    const res = await supabase.auth.signInWithPassword({ email: e, password: p })
    console.log('LOGIN RES:', res)

    setLoading(false)

    if (res.error) {
      setMsg(res.error.message)
      return
    }

    setMsg('Login OK.')
  }

  async function signOut() {
    setLoading(true)
    setMsg(null)

    const res = await supabase.auth.signOut()
    console.log('LOGOUT RES:', res)

    setLoading(false)

    if (res.error) {
      setMsg(res.error.message)
      return
    }

    setMsg('Logout OK.')
  }

  return (
    <main style={{ padding: 20, maxWidth: 520 }}>
      <h1>Auth</h1>

      {userEmail ? (
        <>
          <p>
            Ulogovan: <b>{userEmail}</b>
          </p>
          <button onClick={signOut} disabled={loading}>
            {loading ? '...' : 'Logout'}
          </button>
        </>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              placeholder="email"
              name="email"
              autoComplete="email"
              style={{ padding: 8 }}
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              placeholder="password"
              type="password"
              name="password"
              autoComplete="new-password"
              style={{ padding: 8 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={signUp} disabled={loading}>
              {loading ? '...' : 'Sign up'}
            </button>
            <button onClick={signIn} disabled={loading}>
              {loading ? '...' : 'Login'}
            </button>
          </div>
        </>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <p style={{ marginTop: 20, opacity: 0.7 }}>
        Napomena: pošto ti je <b>Confirm email</b> uključen u Supabase-u, posle Sign up moraš potvrditi email pre
        prvog uspešnog logina.
      </p>
    </main>
  )
}