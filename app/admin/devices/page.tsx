"use client";

import { useState } from "react";

type Device = {
  device_fp: string;
  device_id: string | null;
  first_seen: string | null;
  last_seen: string | null;
};

export default function AdminDevicesPage() {
  const [adminKey, setAdminKey] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<string>("");

  async function loadDevices() {
    setStatus("Loading...");
    setDevices([]);

    const res = await fetch("/api/admin/devices/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_key: adminKey, license_key: licenseKey }),
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
    setStatus("Removing...");
    const res = await fetch("/api/admin/devices/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_key: adminKey, license_key: licenseKey, device_fp }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      setStatus(`ERROR: ${json.error ?? "unknown"}`);
      return;
    }

    setStatus(`OK: deleted ${device_fp}`);
    await loadDevices();
  }

  async function resetAll() {
    if (!confirm("Reset ALL devices for this license?")) return;

    setStatus("Resetting all...");
    const res = await fetch("/api/admin/devices/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_key: adminKey, license_key: licenseKey, reset_all: true }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      setStatus(`ERROR: ${json.error ?? "unknown"}`);
      return;
    }

    setStatus("OK: deleted all devices");
    await loadDevices();
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16, fontFamily: "sans-serif" }}>
      <h1>Admin: License Devices</h1>

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <label>
          Admin key
          <input
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            placeholder="VETASIST_ADMIN_API_KEY"
          />
        </label>

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
          <button onClick={resetAll} style={{ padding: "8px 12px" }}>
            Reset all
          </button>
        </div>

        <div><b>Status:</b> {status}</div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>device_id</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>device_fp</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>last_seen</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.device_fp}>
              <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{d.device_id ?? "-"}</td>
              <td style={{ borderBottom: "1px solid #eee", padding: 8, fontFamily: "monospace" }}>
                {d.device_fp}
              </td>
              <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                {d.last_seen ?? "-"}
              </td>
              <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                <button onClick={() => removeOne(d.device_fp)} style={{ padding: "6px 10px" }}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {devices.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: 8, color: "#666" }}>
                No devices loaded.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
