'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function login() {
    setLoading(true)
    setMsg(null)
    setErr(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: 'https://app.vetasist.net/app'
      }
    })

    setLoading(false)

    if (error) {
      setErr(error.message)
    } else {
      setMsg('Login link je poslat na email.')
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 400 }}>

      <h1>VetAssist Login</h1>

      <p>Unesi email da dobiješ login link.</p>

      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        style={{ width: '100%', padding: 8, marginBottom: 10 }}
      />

      <button onClick={login} disabled={loading}>
        {loading ? 'Šaljem...' : 'Pošalji login link'}
      </button>

      {msg && <p style={{ color: 'green' }}>{msg}</p>}
      {err && <p style={{ color: 'red' }}>{err}</p>}

    </main>
  )
}
