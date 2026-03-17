"use client";

import { useEffect, useMemo, useState } from "react";
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
  role: string;
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

type PlanRow = {
  id: string;
  device_limit: number | null;
};

type SubscriptionActionLinks = {
  customer_portal: string | null;
  update_payment_method: string | null;
  update_customer_portal: string | null;
};

type SubscriptionActionPlan = {
  id: string;
  label: string;
};

type SubscriptionActionState = {
  status: string;
  provider_status: string | null;
  valid_until: string | null;
  cancel_at_period_end: boolean;
};

export default function OwnerDashboard() {
  const [email, setEmail] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [org, setOrg] = useState<Org | null>(null);
  const [subscription, setSubscription] = useState<Sub | null>(null);
  const [license, setLicense] = useState<License | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceLimit, setDeviceLimit] = useState<number | null>(null);

  const [billingLinks, setBillingLinks] = useState<SubscriptionActionLinks | null>(null);
  const [availablePlans, setAvailablePlans] = useState<SubscriptionActionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [subscriptionActionState, setSubscriptionActionState] =
    useState<SubscriptionActionState | null>(null);

  const [loading, setLoading] = useState(true);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [subscriptionActionsLoading, setSubscriptionActionsLoading] = useState(false);
  const [actionLoadingFp, setActionLoadingFp] = useState<string | null>(null);
  const [subscriptionActionLoading, setSubscriptionActionLoading] =
    useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [subscriptionActionsError, setSubscriptionActionsError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeDevicesCount = useMemo(
    () => devices.filter((d) => d.status === "active").length,
    [devices]
  );

  const showResumeButton = !!subscriptionActionState?.cancel_at_period_end;
  const showCancelButton = !subscriptionActionState?.cancel_at_period_end;

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
      .select("org_id, role, organizations(id,name)")
      .eq("user_id", userId)
      .eq("role", "owner")
      .order("created_at", { ascending: true });

    if (error) throw error;

    const rows = (data as OrgMemberRow[] | null) ?? [];

    if (rows.length === 0) {
      throw new Error("Nije pronađena owner organizacija za ovaj nalog.");
    }

    if (rows.length > 1) {
      throw new Error(
        "Pronađeno je više owner organizacija za isti nalog. Potrebno je čišćenje podataka u bazi."
      );
    }

    const normalizedOrg = normalizeOrganization(rows[0].organizations);

    if (!normalizedOrg) {
      throw new Error("Nije pronađena organizacija za ovaj owner nalog.");
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

    const sub = (data as Sub | null) ?? null;
    setSubscription(sub);

    if (sub?.plan_id) {
      setSelectedPlanId(String(sub.plan_id));
    } else {
      setSelectedPlanId("");
    }

    return sub;
  }

  async function loadPlanLimit(planId: string | null | undefined) {
    if (!planId) {
      setDeviceLimit(null);
      return;
    }

    const { data, error } = await supabase
      .from("plans")
      .select("id,device_limit")
      .eq("id", planId)
      .maybeSingle<PlanRow>();

    if (error) throw error;

    setDeviceLimit(data?.device_limit ?? null);
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

      const text = await res.text();
      let json: any = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Nevažeći odgovor servera (${res.status}).`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.details || json?.error || "devices_load_failed");
      }

      setDevices(json.devices ?? []);
    } catch (e: any) {
      setDevices([]);
      setDevicesError(e?.message ?? "devices_load_failed");
    } finally {
      setDevicesLoading(false);
    }
  }

  async function loadSubscriptionActions(orgId: string, token: string) {
    setSubscriptionActionsLoading(true);
    setSubscriptionActionsError(null);

    try {
      const res = await fetch(`/api/owner/subscription?org_id=${encodeURIComponent(orgId)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const text = await res.text();
      let json: any = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Nevažeći odgovor servera (${res.status}).`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.details || json?.error || "subscription_actions_load_failed");
      }

      setBillingLinks(json.links ?? null);
      setAvailablePlans(json.available_plans ?? []);
      setSubscriptionActionState(json.subscription ?? null);

      if (json.subscription?.plan_id) {
        setSelectedPlanId(String(json.subscription.plan_id));
      }
    } catch (e: any) {
      setBillingLinks(null);
      setAvailablePlans([]);
      setSubscriptionActionState(null);
      setSubscriptionActionsError(errorLabel(e?.message ?? "subscription_actions_load_failed"));
    } finally {
      setSubscriptionActionsLoading(false);
    }
  }

  async function init() {
    try {
      setLoading(true);
      setError(null);
      setMessage(null);
      setSubscriptionActionsError(null);

      const sessionInfo = await loadSession();

      if (!sessionInfo.userId || !sessionInfo.accessToken) {
        setOrg(null);
        setSubscription(null);
        setLicense(null);
        setDevices([]);
        setDeviceLimit(null);
        setBillingLinks(null);
        setAvailablePlans([]);
        setSubscriptionActionState(null);
        setSelectedPlanId("");
        return;
      }

      const orgId = await loadOrg(sessionInfo.userId);

      const sub = await loadSubscription(orgId);

      await Promise.all([
        loadLicense(orgId),
        loadPlanLimit(sub?.plan_id),
        loadDevices(orgId, sessionInfo.accessToken),
        loadSubscriptionActions(orgId, sessionInfo.accessToken),
      ]);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setOrg(null);
      setSubscription(null);
      setLicense(null);
      setDevices([]);
      setDeviceLimit(null);
      setBillingLinks(null);
      setAvailablePlans([]);
      setSubscriptionActionState(null);
      setSelectedPlanId("");
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

      const text = await res.text();
      let json: any = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Nevažeći odgovor servera (${res.status}).`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.details || json?.error || "reset_failed");
      }

      setMessage("Uređaj je resetovan.");
      await loadDevices(org.id, accessToken);
    } catch (e: any) {
      setDevicesError(errorLabel(e?.message ?? "reset_failed"));
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

      const text = await res.text();
      let json: any = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Nevažeći odgovor servera (${res.status}).`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.details || json?.error || "undo_failed");
      }

      setMessage("Reset je vraćen.");
      await loadDevices(org.id, accessToken);
    } catch (e: any) {
      setDevicesError(errorLabel(e?.message ?? "undo_failed"));
    } finally {
      setActionLoadingFp(null);
    }
  }

  async function handleSubscriptionAction(
    action: "cancel" | "resume" | "change_plan"
  ) {
    if (!accessToken || !org?.id) return;

    if (action === "change_plan") {
      if (!selectedPlanId) {
        setSubscriptionActionsError("Izaberi plan.");
        return;
      }

      if (selectedPlanId === String(subscription?.plan_id || "").trim().toLowerCase()) {
        setSubscriptionActionsError("Već koristiš taj plan.");
        return;
      }
    }

    let confirmed = true;

    if (action === "cancel") {
      confirmed = window.confirm(
        "Da li sigurno želiš da otkažeš pretplatu? Pretplata će ostati aktivna do kraja plaćenog perioda."
      );
    }

    if (action === "resume") {
      confirmed = window.confirm(
        "Da li želiš da nastaviš automatsku pretplatu?"
      );
    }

    if (action === "change_plan") {
      const selectedLabel =
        availablePlans.find((p) => p.id === selectedPlanId)?.label || selectedPlanId;

      confirmed = window.confirm(
        `Da li želiš da promeniš plan na ${selectedLabel}?`
      );
    }

    if (!confirmed) return;

    setSubscriptionActionLoading(action);
    setSubscriptionActionsError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/owner/subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          org_id: org.id,
          action,
          plan_id: action === "change_plan" ? selectedPlanId : undefined,
        }),
      });

      const text = await res.text();
      let json: any = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Nevažeći odgovor servera (${res.status}).`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.details?.errors?.[0]?.detail || json?.details || json?.error || "subscription_action_failed");
      }

      setMessage(json?.message || "Akcija je uspešno poslata.");
      await init();
    } catch (e: any) {
      setSubscriptionActionsError(
        errorLabel(e?.message ?? "subscription_action_failed")
      );
    } finally {
      setSubscriptionActionLoading(null);
    }
  }

  function formatDate(value: string | null) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString("sr-RS");
  }

  function shortFp(fp: string) {
    if (!fp) return "";
    return fp.length > 18 ? fp.slice(0, 18) + "…" : fp;
  }

  function statusLabel(status: string | null) {
    if (status === "active") return "Active";
    if (status === "passive") return "Inactive";
    if (status === "reset_blocked") return "Reset (cooldown)";
    return status ?? "-";
  }

  function errorLabel(err: string) {
    if (err === "owner_restore_time_window_expired") return "Undo period je istekao.";
    if (err === "owner_restore_window_expired") return "Undo period je istekao.";
    if (err === "device_reset_cooldown_active") return "Uređaj je u cooldown periodu nakon reseta.";
    if (err === "device_not_found") return "Uređaj nije pronađen.";
    if (err === "device_not_reset_blocked") return "Ovaj uređaj nije u reset blokadi.";
    if (err === "device_limit_reached") return "Dostignut je limit uređaja za ovaj plan.";
    if (err === "no_active_license") return "Nema aktivne licence za ovu organizaciju.";
    if (err === "forbidden") return "Nemaš owner pristup ovoj organizaciji.";
    if (err === "unauthorized") return "Sesija je istekla. Uloguj se ponovo.";
    if (err === "same_plan") return "Već koristiš taj plan.";
    if (err === "missing_plan_id") return "Izaberi plan.";
    if (err === "missing_org_id") return "Nedostaje organizacija.";
    if (err === "unknown_plan_id") return "Nepoznat plan.";
    if (err === "no_lemonsqueezy_subscription") return "Za ovu organizaciju nije pronađena Lemon Squeezy pretplata.";
    if (err === "lemonsqueezy_fetch_failed") return "Ne mogu da učitam billing linkove iz Lemon Squeezy-ja.";
    if (err === "lemonsqueezy_cancel_failed") return "Otkazivanje pretplate nije uspelo.";
    if (err === "lemonsqueezy_resume_failed") return "Nastavak pretplate nije uspeo.";
    if (err === "lemonsqueezy_change_plan_failed") return "Promena plana nije uspela.";
    if (err === "subscription_lookup_failed") return "Ne mogu da pronađem pretplatu za ovu organizaciju.";
    if (err === "membership_lookup_failed") return "Ne mogu da proverim owner pristup organizaciji.";
    return err;
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
      {org ? <p><b>{org.name}</b></p> : <p>Nema owner organizacije povezane sa ovim nalogom.</p>}

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
          <p><b>Status:</b> {subscriptionActionState?.status || subscription.status}</p>
          <p><b>Plan:</b> {subscription.plan_id}</p>
          <p><b>Valid until:</b> {formatDate(subscriptionActionState?.valid_until || subscription.valid_until)}</p>
          <p>
            <b>Devices used:</b>{" "}
            {activeDevicesCount}
            {deviceLimit !== null ? ` / ${deviceLimit}` : ""}
          </p>
        </div>
      ) : (
        <p>Nema subscription zapisa za ovu organizaciju.</p>
      )}

      <div
        style={{
          marginTop: 20,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          background: "#fafafa",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Upravljanje pretplatom</h3>

        {subscriptionActionsError && (
          <p style={{ color: "red" }}>Greška pretplata: {subscriptionActionsError}</p>
        )}

        {subscriptionActionsLoading ? (
          <p>Učitavam billing opcije...</p>
        ) : billingLinks ? (
          <>
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              {billingLinks.customer_portal ? (
                <a href={billingLinks.customer_portal} target="_blank" rel="noreferrer" style={actionLinkStyle}>
                  Otvori billing portal
                </a>
              ) : null}

              {billingLinks.update_payment_method ? (
                <a href={billingLinks.update_payment_method} target="_blank" rel="noreferrer" style={actionLinkStyle}>
                  Promeni karticu
                </a>
              ) : null}

              {billingLinks.update_customer_portal ? (
                <a href={billingLinks.update_customer_portal} target="_blank" rel="noreferrer" style={actionLinkStyle}>
                  Promeni plan u Lemon-u
                </a>
              ) : null}
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <select
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  minWidth: 180,
                }}
              >
                <option value="">Izaberi plan</option>
                {availablePlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.label}
                  </option>
                ))}
              </select>

              <button
                onClick={() => handleSubscriptionAction("change_plan")}
                disabled={subscriptionActionLoading === "change_plan" || !selectedPlanId}
                style={buttonStyle}
              >
                {subscriptionActionLoading === "change_plan" ? "Radim..." : "Promeni plan"}
              </button>

              {showCancelButton ? (
                <button
                  onClick={() => handleSubscriptionAction("cancel")}
                  disabled={subscriptionActionLoading === "cancel"}
                  style={dangerButtonStyle}
                >
                  {subscriptionActionLoading === "cancel" ? "Radim..." : "Otkaži pretplatu"}
                </button>
              ) : null}

              {showResumeButton ? (
                <button
                  onClick={() => handleSubscriptionAction("resume")}
                  disabled={subscriptionActionLoading === "resume"}
                  style={buttonStyle}
                >
                  {subscriptionActionLoading === "resume" ? "Radim..." : "Nastavi pretplatu"}
                </button>
              ) : null}
            </div>

            <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.6 }}>
              Otkazivanje važi za kraj tekućeg plaćenog perioda. Ako je pretplata već
              otkazana za kraj perioda, ovde ćeš dobiti opciju da je nastaviš.
            </p>
          </>
        ) : (
          <p>Nisu dostupne billing opcije za ovu pretplatu.</p>
        )}
      </div>

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
                    <td style={tdStyle} title={device.device_fp}>
                      <code>{shortFp(device.device_fp)}</code>
                    </td>
                    <td style={tdStyle}>{statusLabel(device.status)}</td>
                    <td style={tdStyle}>{formatDate(device.first_seen)}</td>
                    <td style={tdStyle}>{formatDate(device.last_seen)}</td>
                    <td style={tdStyle}>{formatDate(device.blocked_until)}</td>
                    <td style={tdStyle}>{formatDate(device.reset_at)}</td>
                    <td style={tdStyle}>
                      {canUndo ? (
                        <button onClick={() => handleUndo(device.device_fp)} disabled={busy} style={{ padding: "6px 10px" }}>
                          {busy ? "Radim..." : "Undo reset"}
                        </button>
                      ) : (
                        <button onClick={() => handleReset(device.device_fp)} disabled={busy} style={{ padding: "6px 10px" }}>
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

      <div
        style={{
          marginTop: 20,
          padding: 14,
          border: "1px solid #ddd",
          background: "#fafafa",
          borderRadius: 6,
          lineHeight: 1.6,
        }}
      >
        <p style={{ margin: "0 0 10px 0", fontWeight: 700 }}>
          Objašnjenje statusa i pravila
        </p>

        <p style={{ margin: "0 0 8px 0" }}>
          <b>Active</b> — uređaj trenutno zauzima jedno mesto u licenci i može da koristi alat.
        </p>

        <p style={{ margin: "0 0 8px 0" }}>
          <b>Inactive</b> — uređaj nije korišćen duže od 45 dana i njegovo mesto je automatski oslobođeno za novi uređaj.
        </p>

        <p style={{ margin: "0 0 8px 0" }}>
          <b>Reset (cooldown)</b> — uređaj je ručno resetovan i privremeno blokiran. U tom periodu ne može ponovo da se aktivira pod istim identitetom.
        </p>

        <p style={{ margin: "0 0 8px 0" }}>
          <b>Reset at</b> — vreme poslednjeg resetovanja uređaja.
        </p>

        <p style={{ margin: "0 0 8px 0" }}>
          <b>Blocked until</b> — datum do kog traje blokada nakon reseta.
        </p>

        <p style={{ margin: 0 }}>
          <b>Undo reset</b> — moguće je samo kratko nakon reseta, kao zaštita od slučajnog klika i sprečavanje zloupotrebe rotacije uređaja.
        </p>
      </div>
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

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #b91c1c",
  background: "#b91c1c",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const actionLinkStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 8,
  textDecoration: "none",
  border: "1px solid #d1d5db",
  background: "white",
  color: "#111827",
  fontWeight: 700,
};
'''

webhook_content = '''import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!;
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "";
const SEND_LICENSE_EMAILS_IN_TEST_MODE =
  String(process.env.SEND_LICENSE_EMAILS_IN_TEST_MODE || "false").toLowerCase() === "true";

type PlanId = "basic" | "team" | "pro" | "exclusive";

type PlanInfo = {
  plan: PlanId;
  device_limit: number;
};

const PLAN_MAP: Record<number, PlanInfo> = {
  1358750: { plan: "basic", device_limit: 1 },
  1394223: { plan: "team", device_limit: 3 },
  1395047: { plan: "pro", device_limit: 10 },
  1395048: { plan: "exclusive", device_limit: 30 },

  1395337: { plan: "basic", device_limit: 1 },
};

const HANDLED_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_plan_changed",
  "subscription_payment_success",
  "subscription_payment_failed",
]);

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function safeString(value: unknown): string {
  return String(value || "").trim();
}

function verifySignature(body: string, signature: string): boolean {
  try {
    const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
    const digest = hmac.update(body).digest("hex");

    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(String(signature || ""), "utf8");

    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function generateLicenseKey(): string {
  const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `VTS-${part()}-${part()}-${part()}`;
}

function resolvePlanInfo(variantId: number, productNameRaw: string): PlanInfo | null {
  if (PLAN_MAP[variantId]) return PLAN_MAP[variantId];

  const productName = String(productNameRaw || "").trim().toLowerCase();

  if (productName.includes("basic")) return { plan: "basic", device_limit: 1 };
  if (productName.includes("team")) return { plan: "team", device_limit: 3 };
  if (productName.includes("pro")) return { plan: "pro", device_limit: 10 };
  if (productName.includes("exclusive")) return { plan: "exclusive", device_limit: 30 };

  return null;
}

function mapProviderStatusToLocalStatus(providerStatus: string): "active" | "inactive" {
  const s = String(providerStatus || "").trim().toLowerCase();

  if (s === "expired") return "inactive";
  return "active";
}

function resolveValidUntil(params: {
  providerStatus: string;
  renewsAt: string | null;
  endsAt: string | null;
}): string | null {
  const s = String(params.providerStatus || "").trim().toLowerCase();
  const renewsAt = params.renewsAt ? safeString(params.renewsAt) : null;
  const endsAt = params.endsAt ? safeString(params.endsAt) : null;

  if (s === "cancelled" && endsAt) return endsAt;
  if (s === "expired" && endsAt) return endsAt;

  return renewsAt || endsAt || null;
}

function isCancelAtPeriodEnd(providerStatus: string, endsAt: string | null): boolean {
  const s = String(providerStatus || "").trim().toLowerCase();
  return s === "cancelled" && !!safeString(endsAt);
}

function formatDate(value: string | null): string {
  if (!value) return "n/a";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("sr-RS");
}

function extractSubscriptionPayload(body: any) {
  const attrs = body?.data?.attributes ?? {};
  const relationships = body?.data?.relationships ?? {};

  const externalSubscriptionId = safeString(body?.data?.id);
  const providerStatus = safeString(attrs?.status).toLowerCase();

  const externalCustomerId =
    safeString(attrs?.customer_id) ||
    safeString(relationships?.customer?.data?.id) ||
    null;

  const externalVariantIdRaw =
    attrs?.variant_id ??
    attrs?.first_subscription_item?.variant_id ??
    null;

  const externalVariantId =
    externalVariantIdRaw == null || externalVariantIdRaw === ""
      ? null
      : Number(externalVariantIdRaw);

  const email = normalizeEmail(attrs?.user_email || attrs?.customer_email);
  const ownerName = safeString(attrs?.user_name || attrs?.customer_name || email);
  const productName = safeString(attrs?.product_name);

  const renewsAt = safeString(attrs?.renews_at) || null;
  const endsAt = safeString(attrs?.ends_at) || null;
  const testMode = !!attrs?.test_mode || !!body?.meta?.test_mode;

  return {
    event: safeString(body?.meta?.event_name),
    externalSubscriptionId,
    externalCustomerId,
    externalVariantId: Number.isFinite(externalVariantId) ? externalVariantId : null,
    email,
    ownerName,
    productName,
    providerStatus,
    renewsAt,
    endsAt,
    testMode,
  };
}

async function findCanonicalOrganizationByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, owner_email, created_at")
    .eq("owner_email", normalizedEmail)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`organization_lookup_failed:${error.message}`);
  }

  if (!data || data.length === 0) return null;

  if (data.length > 1) {
    throw new Error(`duplicate_owner_email:${normalizedEmail}`);
  }

  return data[0];
}

async function findOrCreateOrganization(params: {
  email: string;
  ownerName: string;
}) {
  const email = normalizeEmail(params.email);
  const ownerName = safeString(params.ownerName) || email;

  if (!email) {
    throw new Error("missing_owner_email");
  }

  const existing = await findCanonicalOrganizationByEmail(email);
  if (existing) {
    if (!safeString(existing.name) && ownerName) {
      const { error } = await supabase
        .from("organizations")
        .update({ name: ownerName })
        .eq("id", existing.id);

      if (error) {
        throw new Error(`organization_update_failed:${error.message}`);
      }
    }

    return existing;
  }

  const { data, error } = await supabase
    .from("organizations")
    .insert({
      name: ownerName,
      owner_email: email,
    })
    .select("id, name, owner_email, created_at")
    .single();

  if (error || !data) {
    throw new Error(`organization_insert_failed:${error?.message || "unknown"}`);
  }

  return data;
}

async function findExistingSubscription(params: {
  externalSubscriptionId: string;
  orgId: string;
}) {
  const externalSubscriptionId = safeString(params.externalSubscriptionId);
  const orgId = safeString(params.orgId);

  if (externalSubscriptionId) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("external_subscription_id", externalSubscriptionId)
      .maybeSingle();

    if (error) {
      throw new Error(`subscription_lookup_by_external_id_failed:${error.message}`);
    }

    if (data) return data;
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`subscription_lookup_by_org_failed:${error.message}`);
  }

  return data ?? null;
}

async function upsertSubscription(params: {
  orgId: string;
  externalSubscriptionId: string;
  externalCustomerId: string | null;
  externalVariantId: number | null;
  planId: PlanId;
  providerStatus: string;
  localStatus: "active" | "inactive";
  validUntil: string | null;
  cancelAtPeriodEnd: boolean;
  event: string;
}) {
  const existing = await findExistingSubscription({
    externalSubscriptionId: params.externalSubscriptionId,
    orgId: params.orgId,
  });

  const payload = {
    org_id: params.orgId,
    plan_id: params.planId,
    status: params.localStatus,
    valid_until: params.validUntil,
    external_provider: "lemonsqueezy",
    external_subscription_id: safeString(params.externalSubscriptionId) || null,
    external_customer_id: params.externalCustomerId,
    external_variant_id: params.externalVariantId,
    provider_status: params.providerStatus || null,
    scheduled_plan_id: null,
    cancel_at_period_end: params.cancelAtPeriodEnd,
    last_webhook_event: params.event,
    last_webhook_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    let query = supabase.from("subscriptions").update(payload);

    if (safeString(existing.external_subscription_id)) {
      query = query.eq("external_subscription_id", safeString(existing.external_subscription_id));
    } else {
      query = query.eq("org_id", params.orgId);
    }

    const { data, error } = await query.select("*").single();

    if (error || !data) {
      throw new Error(`subscription_update_failed:${error?.message || "unknown"}`);
    }

    return data;
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`subscription_insert_failed:${error?.message || "unknown"}`);
  }

  return data;
}

async function ensureCanonicalLicenseForOrg(params: {
  orgId: string;
  planId: PlanId;
}) {
  const orgId = safeString(params.orgId);
  const planId = safeString(params.planId);

  const { data: licenses, error } = await supabase
    .from("license_keys")
    .select("license_key, created_at, is_active, org_id, plan")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`license_lookup_failed:${error.message}`);
  }

  if (licenses && licenses.length > 0) {
    const canonical = licenses[0];
    const otherKeys = licenses.slice(1).map((x) => x.license_key);

    if (!canonical.is_active || safeString(canonical.plan) !== planId) {
      const { error: canonicalUpdateErr } = await supabase
        .from("license_keys")
        .update({
          is_active: true,
          plan: planId,
        })
        .eq("license_key", canonical.license_key);

      if (canonicalUpdateErr) {
        throw new Error(`license_canonical_update_failed:${canonicalUpdateErr.message}`);
      }
    }

    if (otherKeys.length > 0) {
      const { error: deactivateErr } = await supabase
        .from("license_keys")
        .update({ is_active: false })
        .in("license_key", otherKeys);

      if (deactivateErr) {
        throw new Error(`license_deactivate_extras_failed:${deactivateErr.message}`);
      }
    }

    return canonical.license_key;
  }

  let licenseKey = "";
  let inserted = false;
  let attempts = 0;

  while (!inserted && attempts < 10) {
    attempts += 1;
    licenseKey = generateLicenseKey();

    const { error: insertErr } = await supabase
      .from("license_keys")
      .insert({
        license_key: licenseKey,
        org_id: orgId,
        is_active: true,
        plan: planId,
      });

    if (!insertErr) {
      inserted = true;
      break;
    }

    if (!String(insertErr.message || "").toLowerCase().includes("duplicate")) {
      throw new Error(`license_insert_failed:${insertErr.message}`);
    }
  }

  if (!inserted) {
    throw new Error("license_generation_failed");
  }

  return licenseKey;
}

async function deactivateAllLicensesForOrg(orgId: string) {
  const { error } = await supabase
    .from("license_keys")
    .update({ is_active: false })
    .eq("org_id", orgId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`license_deactivate_failed:${error.message}`);
  }
}

async function sendLicenseEmail(params: {
  to: string;
  ownerName: string;
  plan: string;
  deviceLimit: number;
  validUntil: string | null;
  licenseKey: string;
  testMode: boolean;
}) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    console.warn("VetAssist: email skipped because RESEND env is missing");
    return { ok: false, skipped: true, reason: "missing_resend_env" as const };
  }

  if (params.testMode && !SEND_LICENSE_EMAILS_IN_TEST_MODE) {
    console.warn("VetAssist: email skipped in test mode");
    return { ok: false, skipped: true, reason: "test_mode_disabled" as const };
  }

  const ownerName = safeString(params.ownerName) || "korisniče";
  const validUntil = formatDate(params.validUntil);

  const subject = `VetAssist licenca — ${params.plan}`;
  const text = [
    `Poštovani ${ownerName},`,
    ``,
    `Vaša VetAssist pretplata je aktivna.`,
    `Plan: ${params.plan}`,
    `Dozvoljeno uređaja: ${params.deviceLimit}`,
    `Važi do: ${validUntil}`,
    ``,
    `Vaš license key:`,
    `${params.licenseKey}`,
    ``,
    `Dalji koraci:`,
    `1. Instalirajte VetAssist ekstenziju.`,
    `2. Otvorite AIRS.`,
    `3. Unesite license key i sačuvajte licencu.`,
    ``,
    `VetAssist`,
  ].join("\\n");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#222;">
      <h1 style="font-size:24px;">VetAssist licenca</h1>
      <p>Poštovani ${escapeHtml(ownerName)},</p>
      <p>Vaša VetAssist pretplata je aktivna.</p>

      <table style="border-collapse:collapse;margin:16px 0;">
        <tr>
          <td style="padding:6px 12px 6px 0;"><strong>Plan:</strong></td>
          <td style="padding:6px 0;">${escapeHtml(params.plan)}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;"><strong>Dozvoljeno uređaja:</strong></td>
          <td style="padding:6px 0;">${params.deviceLimit}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;"><strong>Važi do:</strong></td>
          <td style="padding:6px 0;">${escapeHtml(validUntil)}</td>
        </tr>
      </table>

      <div style="margin:20px 0;padding:16px;background:#f6f6f6;border:1px solid #e5e5e5;border-radius:10px;">
        <div style="margin-bottom:8px;font-weight:700;">Vaš license key</div>
        <div style="font-size:24px;font-weight:700;letter-spacing:1px;word-break:break-word;">
          ${escapeHtml(params.licenseKey)}
        </div>
      </div>

      <h2 style="font-size:18px;">Dalji koraci</h2>
      <ol>
        <li>Instalirajte VetAssist ekstenziju.</li>
        <li>Otvorite AIRS.</li>
        <li>Unesite license key i sačuvajte licencu.</li>
      </ol>

      <p style="margin-top:24px;">
        <a
          href="https://vetasist.carrd.co/"
          target="_blank"
          rel="noreferrer"
          style="display:inline-block;padding:12px 18px;border-radius:8px;text-decoration:none;border:1px solid #222;color:#222;font-weight:700;"
        >
          Otvori VetAssist sajt
        </a>
      </p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [params.to],
      subject,
      html,
      text,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(`resend_send_failed:${res.status}:${JSON.stringify(data)}`);
  }

  return { ok: true, data };
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();
    const signature = req.headers.get("x-signature") || "";

    if (!verifySignature(bodyText, signature)) {
      return json({ ok: false, error: "invalid_signature" }, 401);
    }

    const body = JSON.parse(bodyText);
    const payload = extractSubscriptionPayload(body);

    if (!HANDLED_EVENTS.has(payload.event)) {
      return json({ ok: true, ignored: true, event: payload.event });
    }

    if (!payload.externalSubscriptionId) {
      return json(
        { ok: false, error: "missing_external_subscription_id", event: payload.event },
        400
      );
    }

    if (!payload.email) {
      return json({ ok: false, error: "missing_owner_email", event: payload.event }, 400);
    }

    const planInfo = resolvePlanInfo(
      payload.externalVariantId ?? 0,
      payload.productName
    );

    if (!planInfo) {
      return json(
        {
          ok: false,
          error: "unknown_variant_id",
          event: payload.event,
          variant_id: payload.externalVariantId,
          product_name: payload.productName,
        },
        400
      );
    }

    const org = await findOrCreateOrganization({
      email: payload.email,
      ownerName: payload.ownerName,
    });

    const localStatus = mapProviderStatusToLocalStatus(payload.providerStatus);
    const validUntil = resolveValidUntil({
      providerStatus: payload.providerStatus,
      renewsAt: payload.renewsAt,
      endsAt: payload.endsAt,
    });

    await upsertSubscription({
      orgId: org.id,
      externalSubscriptionId: payload.externalSubscriptionId,
      externalCustomerId: payload.externalCustomerId,
      externalVariantId: payload.externalVariantId,
      planId: planInfo.plan,
      providerStatus: payload.providerStatus,
      localStatus,
      validUntil,
      cancelAtPeriodEnd: isCancelAtPeriodEnd(payload.providerStatus, payload.endsAt),
      event: payload.event,
    });

    let licenseKey: string | null = null;
    let emailResult: unknown = null;

    if (localStatus === "active") {
      licenseKey = await ensureCanonicalLicenseForOrg({
        orgId: org.id,
        planId: planInfo.plan,
      });

      if (
        licenseKey &&
        (payload.event === "subscription_created" || payload.event === "subscription_resumed")
      ) {
        emailResult = await sendLicenseEmail({
          to: payload.email,
          ownerName: payload.ownerName,
          plan: planInfo.plan,
          deviceLimit: planInfo.device_limit,
          validUntil,
          licenseKey,
          testMode: payload.testMode,
        });
      }
    } else {
      await deactivateAllLicensesForOrg(org.id);
    }

    return json({
      ok: true,
      event: payload.event,
      org_id: org.id,
      owner_email: payload.email,
      external_subscription_id: payload.externalSubscriptionId,
      plan: planInfo.plan,
      provider_status: payload.providerStatus,
      local_status: localStatus,
      valid_until: validUntil,
      cancel_at_period_end: isCancelAtPeriodEnd(payload.providerStatus, payload.endsAt),
      license_key: licenseKey,
      email_result: emailResult,
    });
  } catch (err) {
    const details = err instanceof Error ? err.message : "unknown_server_error";

    if (String(details).startsWith("duplicate_owner_email:")) {
      return json(
        {
          ok: false,
          error: "duplicate_owner_email",
          details,
        },
        409
      );
    }

    return json(
      {
        ok: false,
        error: "server_error",
        details,
      },
      500
    );
  }
}
