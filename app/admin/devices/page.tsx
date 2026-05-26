"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";

type Device = {
  device_fp: string;
  device_id: string | null;
  first_seen: string | null;
  last_seen: string | null;
};

export default function AdminDevicesPage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [licenseKey, setLicenseKey] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    async function loadSession() {
      setLoadingSession(true);

      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        setAccessToken(null);
        setEmail(null);
        setLoadingSession(false);
        return;
      }

      setAccessToken(data.session.access_token);
      setEmail(data.session.user.email ?? null);
      setLoadingSession(false);
    }

    loadSession();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  async function loadDevices() {
    if (!accessToken) {
      setStatus("ERROR: nisi ulogovan kao admin");
      return;
    }

    setStatus("Loading...");
    setDevices([]);

    const res = await fetch("/api/admin/devices/list", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ license_key: licenseKey }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      setStatus(`ERROR: ${json.error ?? "unknown"}`);
      return;
    }

    setDevices(json.devices ?? []);
    setStatus(`OK: loaded ${json.devices?.length ?? 0} devices`);
  }

  async function removeOne(device_fp: string) {
    if (!accessToken) {
      setStatus("ERROR: nisi ulogovan kao admin");
      return;
    }

    setStatus("Resetting...");

    const res = await fetch("/api/admin/devices/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        license_key: licenseKey,
        device_fp,
        action: "reset",
        reason: "admin_manual_reset",
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      setStatus(`ERROR: ${json.error ?? "unknown"}`);
      return;
    }

    setStatus(`OK: reset ${device_fp}`);
    await loadDevices();
  }

  async function restoreOne(device_fp: string) {
    if (!accessToken) {
      setStatus("ERROR: nisi ulogovan kao admin");
      return;
    }

    setStatus("Restoring...");

    const res = await fetch("/api/admin/devices/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        license_key: licenseKey,
        device_fp,
        action: "restore",
        reason: "admin_manual_restore",
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      setStatus(`ERROR: ${json.error ?? "unknown"}`);
      return;
    }

    setStatus(`OK: restored ${device_fp}`);
    await loadDevices();
  }

  if (loadingSession) {
    return (
      <div style={pageStyle}>
        <h1>Admin: License Devices</h1>
        <p>Učitavam sesiju...</p>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div style={pageStyle}>
        <h1>Admin: License Devices</h1>
        <p>Nisi ulogovan.</p>
        <p>
          Idi na <a href="/app/auth">/app/auth</a>, prijavi se admin emailom,
          pa se vrati na ovu stranicu.
        </p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <h1>Admin: License Devices</h1>

      <div style={adminBoxStyle}>
        <div>
          <b>Admin session:</b> {email ?? "-"}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <label>
          License key
          <input
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            placeholder="VTS-XXXX-XXXX-XXXX"
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={loadDevices} style={{ padding: "8px 12px" }}>
            Load
          </button>
        </div>

        <div>
          <b>Status:</b> {status}
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>device_id</th>
            <th style={thStyle}>device_fp</th>
            <th style={thStyle}>first_seen</th>
            <th style={thStyle}>last_seen</th>
            <th style={thStyle}>akcije</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.device_fp}>
              <td style={tdStyle}>{d.device_id ?? "-"}</td>
              <td style={{ ...tdStyle, fontFamily: "monospace" }}>
                {d.device_fp}
              </td>
              <td style={tdStyle}>{d.first_seen ?? "-"}</td>
              <td style={tdStyle}>{d.last_seen ?? "-"}</td>
              <td style={tdStyle}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => removeOne(d.device_fp)}
                    style={{ padding: "6px 10px" }}
                  >
                    Reset
                  </button>

                  <button
                    onClick={() => restoreOne(d.device_fp)}
                    style={{ padding: "6px 10px" }}
                  >
                    Restore
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {devices.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: 8, color: "#666" }}>
                No devices loaded.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 1000,
  margin: "40px auto",
  padding: 16,
  fontFamily: "sans-serif",
};

const adminBoxStyle: React.CSSProperties = {
  padding: 12,
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "#fafafa",
  marginBottom: 16,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: 8,
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: 8,
};
