"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/app/lib/supabase";

type MovementRow = Record<string, string>;
type Job = {
  id: string;
  request_ref: string;
  animal_ids: string[];
  status: "queued" | "running" | "completed" | "needs_review" | "failed";
  created_at: string;
  finished_at: string | null;
  error: string | null;
  result: MovementRow[] | null;
};

function statusLabel(status: Job["status"]) {
  switch (status) {
    case "queued": return "Čeka AIRS tab";
    case "running": return "Provera je u toku";
    case "completed": return "Podaci preuzeti";
    case "needs_review": return "Preuzeto uz upozorenje";
    case "failed": return "Provera nije završena";
  }
}

export default function AdminAirsChecksPage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [animalIds, setAnimalIds] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setAccessToken(null);
        setEmail(null);
      } else {
        setAccessToken(data.session.access_token);
        setEmail(data.session.user.email ?? null);
      }
      setLoadingSession(false);
    }

    void loadSession();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
      setEmail(session?.user?.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!job || !accessToken || (job.status !== "queued" && job.status !== "running")) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const response = await fetch("/api/admin/airs-check-jobs/" + encodeURIComponent(job.id), {
          headers: { Authorization: "Bearer " + accessToken },
          cache: "no-store",
        });
        const value = await response.json();
        if (!response.ok || !value.ok) throw new Error(value.error || "job_lookup_failed");
        if (stopped) return;
        setJob(value.job as Job);
        if (value.job.status === "queued" || value.job.status === "running") {
          timer = setTimeout(poll, 5000);
        }
      } catch (error) {
        if (!stopped) {
          setMessage(error instanceof Error ? error.message : "job_lookup_failed");
          timer = setTimeout(poll, 10000);
        }
      }
    };

    timer = setTimeout(poll, 3000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [job?.id, job?.status, accessToken]);

  async function startCheck() {
    if (!accessToken) {
      setMessage("Nisi prijavljen kao administrator.");
      return;
    }
    const ids = animalIds.split(/\r?\n/).map((id) => id.trim()).filter(Boolean);
    if (!ids.length) {
      setMessage("Unesi najmanje jedan ID grla.");
      return;
    }

    setBusy(true);
    setMessage("Šaljem zahtev. AIRS tab i prijem zadataka moraju biti uključeni.");
    setJob(null);
    try {
      const response = await fetch("/api/admin/airs-check-jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + accessToken,
        },
        body: JSON.stringify({
          request_ref: "operator-" + new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17),
          animal_ids: ids,
        }),
      });
      const value = await response.json();
      if (!response.ok || !value.ok) throw new Error(value.error || "job_create_failed");
      setJob(value.job as Job);
      setMessage("Zadatak je dodat. Ova stranica prati status; obrada se izvršava u AIRS tabu.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "job_create_failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyResult() {
    if (!job) return;
    await navigator.clipboard.writeText(JSON.stringify(job, null, 2));
    setMessage("JSON rezultata je kopiran.");
  }

  if (loadingSession) {
    return <main style={pageStyle}><h1>AIRS provere</h1><p>Učitavam prijavu…</p></main>;
  }

  if (!accessToken) {
    return (
      <main style={pageStyle}>
        <h1>AIRS provere</h1>
        <p>Nisi prijavljen.</p>
        <p>Prijavi se administratorskim nalogom na <a href="/app/auth">/app/auth</a>, pa ponovo otvori ovu stranicu.</p>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <h1>AIRS provere kretanja</h1>
      <p>Prijavljen administrator: {email ?? "—"}</p>
      <section style={boxStyle}>
        <h2>Pokreni read-only proveru</h2>
        <p>Otvori AIRS, prijavi se i uključi „GOO probne provere“ u ekstenziji. Provera samo čita kretanja; ne menja podatke u AIRS-u.</p>
        <label htmlFor="animal-ids">ID grla, jedan po redu (do 20)</label>
        <textarea
          id="animal-ids"
          value={animalIds}
          onChange={(event) => setAnimalIds(event.target.value)}
          rows={7}
          placeholder={"RS7128345976\n7154972875"}
          style={textareaStyle}
          disabled={busy}
        />
        <button onClick={startCheck} disabled={busy} style={buttonStyle}>
          {busy ? "Šaljem…" : "Pokreni AIRS proveru"}
        </button>
        <p role="status">{message}</p>
      </section>

      {job && (
        <section style={boxStyle}>
          <h2>{statusLabel(job.status)}</h2>
          <p><b>Referenca:</b> {job.request_ref}</p>
          <p><b>Status:</b> {job.status}{job.error ? " — " + job.error : ""}</p>
          <p><b>Grla:</b> {job.animal_ids.join(", ")}</p>
          {(job.status === "queued" || job.status === "running") && <p>Ostavi ovu stranicu, AIRS tab i Chrome otvorene dok se provera ne završi.</p>}
          {(job.status === "completed" || job.status === "needs_review") && (
            <>
              <p>Uspešno preuzeti podaci nisu odluka o podobnosti zahteva.</p>
              <button onClick={copyResult} style={buttonStyle}>Kopiraj rezultat za pregled</button>
              <div style={{ overflowX: "auto", marginTop: 16 }}>
                <table style={tableStyle}>
                  <thead><tr>{["Broj životinje", "Kretanje", "Datum dolaska", "Datum odlaska", "Dolazak na gazdinstvo", "Držalac"].map((field) => <th key={field} style={cellStyle}>{field}</th>)}</tr></thead>
                  <tbody>
                    {(job.result ?? []).map((row, index) => (
                      <tr key={fieldKey(row, index)}>
                        {["Broj životinje", "Kretanje", "Datum dolaska", "Datum odlaska", "Dolazak na gazdinstvo", "Držalac"].map((field) => <td key={field} style={cellStyle}>{row[field] || "—"}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function fieldKey(row: MovementRow, index: number) {
  return row["Broj životinje"] + "-" + index;
}

const pageStyle: CSSProperties = {
  maxWidth: 980,
  margin: "40px auto",
  padding: 24,
  fontFamily: "Arial, sans-serif",
  color: "#172033",
};
const boxStyle: CSSProperties = {
  border: "1px solid #ccd3df",
  borderRadius: 12,
  padding: 20,
  marginTop: 20,
  background: "#fff",
};
const textareaStyle: CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: 12,
  marginTop: 8,
  marginBottom: 12,
  fontFamily: "monospace",
  fontSize: 15,
};
const buttonStyle: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #7a879e",
  background: "#edf4ff",
  cursor: "pointer",
};
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const cellStyle: CSSProperties = {
  textAlign: "left",
  border: "1px solid #ccd3df",
  padding: 8,
  verticalAlign: "top",
};
