"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Org = {
  id: string;
  name: string;
};

type Sub = {
  plan_id: string;
  status: string;
  valid_until: string | null;
};

type License = {
  license_key: string;
  is_active: boolean;
};

type OrgMemberRow = {
  org_id: string;
  organizations: { id: string; name: string }[] | { id: string; name: string } | null;
};

type Device = {
  device_id: string | null;
  device_fp: string;
  status: string | null;
  first_seen: string | null;
  last_seen: string | null;
  blocked_until: string | null;
  reset_at: string | null;
  reset_reason?: string | null;
};

export default function OwnerDashboard() {
  const [email, setEmail] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [org, setOrg] = useState<Org | null>(null);
  const [subscription, setSubscription] = useState<Sub | null>(null);
  const [license, setLicense] = useState<License | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);

  const [loading, setLoading] = useState(true);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [actionLoadingFp, setActionLoadingFp] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadSession() {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    const session = data.session ?? null;
    const user = session?.user ?? null;

    setEmail(user?.email ?? null);
    setAccessToken(session?.access_token ?? null);

    return {
      userId: user?.id ?? null,
      accessToken: session?.access_token ?? null,
    };
  }

  function normalizeOrganization(value: OrgMemberRow["organizations"]): Org | null {
    if (!value) return null;

    if (Array.isArray(value)) {
      if (!value.length) return null;
      return {
        id: String(value[0].id),
        name: String(value[0].name),
      };
    }

    return {
      id: String(value.id),
      name: String(value.name),
    };
  }

  async function loadOrg(userId: string) {
    const { data, error } = await supabase
      .from("org_members")
      .select("org_id, organizations(id,name)")
      .eq("user_id", userId)
      .limit(1)
      .single<OrgMemberRow>();

    if (error) throw error;

    const normalizedOrg = normalizeOrganization(data.organizations);

    if (!normalizedOrg) {
      throw new Error("Nije pronađena organizacija za ovaj nalog.");
    }

    setOrg(normalizedOrg);
    return normalizedOrg.id;
  }

  async function loadSubscription(orgId: string) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("plan_id,status,valid_until")
      .eq("org_id", orgId)
      .maybeSingle();

    if (error) throw error;

    setSubscription((data as Sub | null) ?? null);
  }

  async function loadLicense(orgId: string) {
    const { data, error } = await supabase
      .from("license_keys")
      .select("license_key,is_active")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;

    setLicense((data as License | null) ?? null);
  }

  async function loadDevices(orgId: string, token: string) {
    setDevicesLoading(true);
    setDevicesError(null);

    try {
      const res = await fetch(`/api/owner/devices?org_id=${encodeURIComponent(orgId)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "devices_load_failed");
      }

      setDevices(json.devices ?? []);
    } catch (e: any) {
      setDevices([]);
      setDevicesError(e?.message ?? "devices_load_failed");
    } finally {
      setDevicesLoading(false);
    }
  }

  async function init() {
    try {
      setLoading(true);
      setError(null);
      setMessage(null);

      const sessionInfo = await loadSession();

      if (!sessionInfo.userId || !sessionInfo.accessToken) {
        setOrg(null);
        setSubscription(null);
        setLicense(null);
        setDevices([]);
        return;
      }

      const orgId = await loadOrg(sessionInfo.userId);

      await Promise.all([
        loadSubscription(orgId),
        loadLicense(orgId),
      ]);

      await loadDevices(orgId, sessionInfo.accessToken);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setOrg(null);
      setSubscription(null);
      setLicense(null);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    init();

    const { data } = supabase.auth.onAuthStateChange(() => {
      init();
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
  }

  async function handleReset(deviceFp: string) {
    if (!org?.id || !accessToken) return;

    const confirmed = window.confirm(
      "Reset ovog uređaja ga blokira i ne može sam ponovo da se aktivira dok ne uradiš Undo u roku od 10 minuta ili dok ne istekne cooldown."
    );
    if (!confirmed) return;

    setActionLoadingFp(deviceFp);
    setMessage(null);
    setDevicesError(null);

    try {
      const res = await fetch("/api/owner/devices/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          org_id: org.id,
          device_fp: deviceFp,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.details || json.error || "reset_failed");
      }

      setMessage("Uređaj je resetovan.");
      await loadDevices(org.id, accessToken);
    } catch (e: any) {
      setDevicesError(e?.message ?? "reset_failed");
    } finally {
      setActionLoadingFp(null);
    }
  }

  async function handleUndo(deviceFp: string) {
    if (!org?.id || !accessToken) return;

    setActionLoadingFp(deviceFp);
    setMessage(null);
    setDevicesError(null);

    try {
      const res = await fetch("/api/owner/devices/undo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          org_id: org.id,
          device_fp: deviceFp,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.details || json.error || "undo_failed");
      }

      setMessage("Reset je vraćen.");
      await loadDevices(org.id, accessToken);
    } catch (e: any) {
      setDevicesError(e?.message ?? "undo_failed");
    } finally {
      setActionLoadingFp(null);
    }
  }

  function formatDate(value: string | null) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString("sr-RS");
  }

  if (loading) {
    return (
      <main style={{ padding: 40 }}>
        <h2>Loading...</h2>
      </main>
    );
  }

  return (
    <main style={{ padding: 40, maxWidth: 1100 }}>
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

      {error && <p style={{ color: "red" }}>Greška: {error}</p>}
      {message && <p style={{ color: "green" }}>{message}</p>}

      <hr />

      <h2>Organizacija</h2>
      {org ? <p><b>{org.name}</b></p> : <p>Nema organizacije povezane sa ovim nalogom.</p>}

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
            <b>Aktivna:</b> {license.is_active ? "DA" : "NE"}
          </p>
        </div>
      ) : (
        <p>Nema aktivne licence za ovu organizaciju.</p>
      )}

      <hr />

      <h2>Pretplata</h2>
      {subscription ? (
        <div>
          <p><b>Status:</b> {subscription.status}</p>
          <p><b>Plan:</b> {subscription.plan_id}</p>
          <p><b>Valid until:</b> {subscription.valid_until ?? "nema"}</p>
        </div>
      ) : (
        <p>Nema subscription zapisa.</p>
      )}

      <hr />

      <h2>Uređaji</h2>

      {devicesError && <p style={{ color: "red" }}>Greška uređaji: {devicesError}</p>}
      {devicesLoading && <p>Učitavam uređaje...</p>}

      {!devicesLoading && devices.length === 0 ? (
        <p>Nema registrovanih uređaja.</p>
      ) : null}

      {!devicesLoading && devices.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
            <thead>
              <tr>
                <th style={thStyle}>Device ID</th>
                <th style={thStyle}>Fingerprint</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>First seen</th>
                <th style={thStyle}>Last seen</th>
                <th style={thStyle}>Blocked until</th>
                <th style={thStyle}>Reset at</th>
                <th style={thStyle}>Akcija</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => {
                const busy = actionLoadingFp === device.device_fp;
                const canUndo = device.status === "reset_blocked";

                return (
                  <tr key={device.device_fp}>
                    <td style={tdStyle}>{device.device_id ?? "-"}</td>
                    <td style={tdStyle}><code>{device.device_fp}</code></td>
                    <td style={tdStyle}>{device.status ?? "-"}</td>
                    <td style={tdStyle}>{formatDate(device.first_seen)}</td>
                    <td style={tdStyle}>{formatDate(device.last_seen)}</td>
                    <td style={tdStyle}>{formatDate(device.blocked_until)}</td>
                    <td style={tdStyle}>{formatDate(device.reset_at)}</td>
                    <td style={tdStyle}>
                      {canUndo ? (
                        <button
                          onClick={() => handleUndo(device.device_fp)}
                          disabled={busy}
                          style={{ padding: "6px 10px" }}
                        >
                          {busy ? "Radim..." : "Undo reset"}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReset(device.device_fp)}
                          disabled={busy}
                          style={{ padding: "6px 10px" }}
                        >
                          {busy ? "Radim..." : "Reset"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <p style={{ marginTop: 16, opacity: 0.8 }}>
        Napomena: reset uređaja aktivira cooldown. Undo reset je moguć samo kratko nakon reseta.
      </p>
    </main>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: 8,
  background: "#f7f7f7",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: 8,
  verticalAlign: "top",
};
