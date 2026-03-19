"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Org = {
  id: string;
  name: string;
};

type Sub = {
  plan_id: string;
  status: string; // lokalni access status iz baze
  valid_until: string | null;
  provider_status?: string | null;
  cancel_at_period_end?: boolean | null;
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
      .select("plan_id,status,valid_until,provider_status,cancel_at_period_end")
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
      confirmed = window.confirm("Da li želiš da nastaviš automatsku pretplatu?");
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
        throw new Error(
          json?.details?.errors?.[0]?.detail ||
            json?.details ||
            json?.error ||
            "subscription_action_failed"
        );
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
      <h1>VetAssist — Licenca i korisnici</h1>

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
  <p><b>Status pristupa:</b> {subscription.status}</p>
  <p>
    <b>Status pretplate:</b>{" "}
    {subscriptionActionState?.provider_status ||
      subscription.provider_status ||
      subscriptionActionState?.status ||
      "-"}
  </p>
  <p><b>Plan:</b> {subscription.plan_id}</p>
  <p>
    <b>Valid until:</b>{" "}
    {formatDate(subscriptionActionState?.valid_until || subscription.valid_until)}
  </p>
  <p>
    <b>Otkazivanje na kraju perioda:</b>{" "}
    {(subscriptionActionState?.cancel_at_period_end ??
      subscription.cancel_at_period_end)
      ? "DA"
      : "NE"}
  </p>
  <p>
    <b>Devices used:</b> {activeDevicesCount}
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
              Ovde vidiš da li je licenca aktivna i do kada možeš da koristiš alat. Ako je pretplata otkazana, alat nastavlja da radi do datuma isteka licence.
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
