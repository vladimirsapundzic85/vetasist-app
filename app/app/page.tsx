"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Org = {
  id: string;
  name: string;
};

type Sub = {
  plan_id: string;
  status?: string | null;
  local_status?: string | null;
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
  plan_id?: string | null;
  status?: string | null;
  local_status?: string | null;
  provider_status: string | null;
  valid_until: string | null;
  cancel_at_period_end: boolean;
};

type UiSubscriptionStatus =
  | "active"
  | "cancelled"
  | "expired"
  | "payment_failed"
  | "paused"
  | "unknown";

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

  const mergedSubscription = useMemo<Sub | null>(() => {
    if (!subscription && !subscriptionActionState) return null;

    return {
      plan_id:
        subscriptionActionState?.plan_id ||
        subscription?.plan_id ||
        "",
      status:
        subscription?.status ||
        subscriptionActionState?.status ||
        subscriptionActionState?.local_status ||
        null,
      local_status:
        subscriptionActionState?.local_status ||
        subscription?.local_status ||
        subscription?.status ||
        null,
      provider_status:
        subscriptionActionState?.provider_status ||
        subscription?.provider_status ||
        null,
      valid_until:
        subscriptionActionState?.valid_until ||
        subscription?.valid_until ||
        null,
      cancel_at_period_end:
        subscriptionActionState?.cancel_at_period_end ??
        subscription?.cancel_at_period_end ??
        false,
    };
  }, [subscription, subscriptionActionState]);

  const uiSubscriptionStatus = useMemo(
    () => resolveUiSubscriptionStatus(mergedSubscription),
    [mergedSubscription]
  );

  const showResumeButton =
    uiSubscriptionStatus === "cancelled" ||
    !!mergedSubscription?.cancel_at_period_end;

  const showCancelButton =
    !!mergedSubscription &&
    uiSubscriptionStatus !== "cancelled" &&
    uiSubscriptionStatus !== "expired";

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

      if (selectedPlanId === String(mergedSubscription?.plan_id || "").trim().toLowerCase()) {
        setSubscriptionActionsError("Već koristiš taj plan.");
        return;
      }
    }

    let confirmed = true;

    if (action === "cancel") {
      confirmed = window.confirm(
        "Da li sigurno želiš da otkažeš pretplatu? Pristup ostaje aktivan do kraja plaćenog perioda."
      );
    }

    if (action === "resume") {
      confirmed = window.confirm("Da li želiš da ponovo uključiš automatsku pretplatu?");
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

  if (loading) {
    return (
      <main style={pageStyle}>
        <h2>Učitavam...</h2>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>VetAssist owner panel</h1>
          <p style={subtitleStyle}>
            Upravljanje licencom, pretplatom i uređajima organizacije.
          </p>
        </div>

        {email ? (
          <div style={userBoxStyle}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>Ulogovan</div>
            <div style={{ fontWeight: 800 }}>{email}</div>
            <button onClick={logout} style={secondaryButtonStyle}>
              Logout
            </button>
          </div>
        ) : null}
      </header>

      {!email ? (
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Nisi ulogovan</h2>
          <p>
            Idi na <a href="/app/auth">/app/auth</a> i prijavi se magic linkom.
          </p>
        </section>
      ) : null}

      {error && <Alert tone="danger" title="Greška" text={error} />}
      {message && <Alert tone="success" title="Uspešno" text={message} />}

      <section style={gridStyle}>
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Organizacija</h2>
          {org ? (
            <>
              <p style={labelStyle}>Naziv</p>
              <p style={valueStyle}>{org.name}</p>
            </>
          ) : (
            <p>Nema owner organizacije povezane sa ovim nalogom.</p>
          )}
        </div>

        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Licenca</h2>
          {license ? (
            <>
              <p style={labelStyle}>License key</p>
              <code style={licenseCodeStyle}>{license.license_key}</code>

              <p style={{ ...labelStyle, marginTop: 16 }}>Status licence</p>
              <StatusPill
                text={license.is_active ? "AKTIVNA" : "NEAKTIVNA"}
                tone={license.is_active ? "green" : "red"}
              />
            </>
          ) : (
            <p>Nema aktivne licence za ovu organizaciju.</p>
          )}
        </div>
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Pretplata</h2>
            <p style={mutedTextStyle}>
              Status pretplate dolazi iz Lemon Squeezy-ja, a pristup se određuje prema licenci i važenju perioda.
            </p>
          </div>

          <StatusPill
            text={subscriptionStatusTitle(uiSubscriptionStatus)}
            tone={subscriptionStatusTone(uiSubscriptionStatus)}
          />
        </div>

        {mergedSubscription ? (
          <>
            <div style={subscriptionNoticeStyle(uiSubscriptionStatus)}>
              {subscriptionMessage(uiSubscriptionStatus, mergedSubscription)}
            </div>

            <div style={factsGridStyle}>
              <Fact label="Plan" value={mergedSubscription.plan_id || "-"} />
              <Fact
                label="Status pretplate"
                value={mergedSubscription.provider_status || "-"}
              />
              <Fact
                label="Status pristupa"
                value={mergedSubscription.local_status || mergedSubscription.status || "-"}
              />
              <Fact
                label="Važi do"
                value={formatDate(mergedSubscription.valid_until)}
              />
              <Fact
                label="Otkazivanje na kraju perioda"
                value={mergedSubscription.cancel_at_period_end ? "DA" : "NE"}
              />
              <Fact
                label="Uređaji"
                value={`${activeDevicesCount}${deviceLimit !== null ? ` / ${deviceLimit}` : ""}`}
              />
            </div>
          </>
        ) : (
          <p>Nema subscription zapisa za ovu organizaciju.</p>
        )}

        <div style={billingBoxStyle}>
          <h3 style={{ margin: "0 0 12px 0" }}>Upravljanje pretplatom</h3>

          {subscriptionActionsError && (
            <Alert tone="danger" title="Greška pretplate" text={subscriptionActionsError} />
          )}

          {subscriptionActionsLoading ? (
            <p>Učitavam billing opcije...</p>
          ) : billingLinks ? (
            <>
              <div style={actionRowStyle}>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  style={selectStyle}
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

              <div style={actionRowStyle}>
                {billingLinks.customer_portal ? (
                  <a
                    href={billingLinks.customer_portal}
                    target="_blank"
                    rel="noreferrer"
                    style={actionLinkStyle}
                  >
                    Otvori billing portal
                  </a>
                ) : null}

                {billingLinks.update_payment_method ? (
                  <a
                    href={billingLinks.update_payment_method}
                    target="_blank"
                    rel="noreferrer"
                    style={actionLinkStyle}
                  >
                    Promeni karticu
                  </a>
                ) : null}
              </div>

              <p style={mutedTextStyle}>
                Promena plana se pokreće iz VetAssist owner panela. Billing portal služi za karticu, račune i detalje naplate.
              </p>
            </>
          ) : (
            <p>Nisu dostupne billing opcije za ovu pretplatu.</p>
          )}
        </div>
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Uređaji</h2>
            <p style={mutedTextStyle}>
              Aktivni uređaji zauzimaju mesta u licenci. Reset blokira uređaj i oslobađa mesto prema pravilima cooldown-a.
            </p>
          </div>
          <StatusPill
            text={`${activeDevicesCount}${deviceLimit !== null ? ` / ${deviceLimit}` : ""}`}
            tone="blue"
          />
        </div>

        {devicesError && <Alert tone="danger" title="Greška uređaji" text={devicesError} />}
        {devicesLoading && <p>Učitavam uređaje...</p>}

        {!devicesLoading && devices.length === 0 ? (
          <p>Nema registrovanih uređaja.</p>
        ) : null}

        {!devicesLoading && devices.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
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
                      <td style={tdStyle}>
                        <StatusPill
                          text={statusLabel(device.status)}
                          tone={deviceStatusTone(device.status)}
                        />
                      </td>
                      <td style={tdStyle}>{formatDate(device.first_seen)}</td>
                      <td style={tdStyle}>{formatDate(device.last_seen)}</td>
                      <td style={tdStyle}>{formatDate(device.blocked_until)}</td>
                      <td style={tdStyle}>{formatDate(device.reset_at)}</td>
                      <td style={tdStyle}>
                        {canUndo ? (
                          <button
                            onClick={() => handleUndo(device.device_fp)}
                            disabled={busy}
                            style={smallButtonStyle}
                          >
                            {busy ? "Radim..." : "Undo reset"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReset(device.device_fp)}
                            disabled={busy}
                            style={smallButtonStyle}
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

        <div style={infoBoxStyle}>
          <p style={{ margin: "0 0 10px 0", fontWeight: 800 }}>
            Objašnjenje statusa uređaja
          </p>
          <p style={explainTextStyle}>
            <b>Active</b> — uređaj trenutno zauzima jedno mesto u licenci.
          </p>
          <p style={explainTextStyle}>
            <b>Inactive</b> — uređaj nije korišćen duže od 45 dana i mesto je oslobođeno.
          </p>
          <p style={explainTextStyle}>
            <b>Reset cooldown</b> — uređaj je ručno resetovan i privremeno blokiran.
          </p>
          <p style={{ ...explainTextStyle, marginBottom: 0 }}>
            <b>Undo reset</b> — moguće je kratko nakon reseta kao zaštita od slučajnog klika.
          </p>
        </div>
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={factStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value}</div>
    </div>
  );
}

function Alert({
  tone,
  title,
  text,
}: {
  tone: "success" | "danger" | "info";
  title: string;
  text: string;
}) {
  const style =
    tone === "success"
      ? alertSuccessStyle
      : tone === "danger"
      ? alertDangerStyle
      : alertInfoStyle;

  return (
    <div style={style}>
      <b>{title}:</b> {text}
    </div>
  );
}

function StatusPill({
  text,
  tone,
}: {
  text: string;
  tone: "green" | "red" | "yellow" | "blue" | "gray";
}) {
  return <span style={pillStyle(tone)}>{text}</span>;
}

function resolveUiSubscriptionStatus(sub: Sub | null): UiSubscriptionStatus {
  if (!sub) return "unknown";

  const providerStatus = String(sub.provider_status || sub.status || "")
    .trim()
    .toLowerCase();

  if (providerStatus === "cancelled" || sub.cancel_at_period_end) return "cancelled";
  if (providerStatus === "expired") return "expired";
  if (providerStatus === "past_due" || providerStatus === "unpaid" || providerStatus === "payment_failed") {
    return "payment_failed";
  }
  if (providerStatus === "paused") return "paused";
  if (providerStatus === "active") return "active";

  return "unknown";
}

function subscriptionStatusTitle(status: UiSubscriptionStatus) {
  if (status === "active") return "ACTIVE";
  if (status === "cancelled") return "CANCELLED";
  if (status === "expired") return "EXPIRED";
  if (status === "payment_failed") return "PAYMENT FAILED";
  if (status === "paused") return "PAUSED";
  return "UNKNOWN";
}

function subscriptionStatusTone(status: UiSubscriptionStatus): "green" | "red" | "yellow" | "blue" | "gray" {
  if (status === "active") return "green";
  if (status === "cancelled") return "yellow";
  if (status === "expired") return "red";
  if (status === "payment_failed") return "red";
  if (status === "paused") return "yellow";
  return "gray";
}

function subscriptionMessage(status: UiSubscriptionStatus, sub: Sub) {
  const date = formatDate(sub.valid_until);

  if (status === "active") {
    return `Pretplata je aktivna. Sledeći obračunski period ili važenje je do: ${date}.`;
  }

  if (status === "cancelled") {
    return `Pretplata je otkazana, ali pristup ostaje aktivan do kraja plaćenog perioda: ${date}.`;
  }

  if (status === "expired") {
    return `Pretplata je istekla. Pristup može biti blokiran ako nema aktivne licence.`;
  }

  if (status === "payment_failed") {
    return `Plaćanje nije uspelo. Korisnik treba da ažurira karticu ili proveri naplatu.`;
  }

  if (status === "paused") {
    return `Pretplata je pauzirana. Proveriti status naplate pre daljeg korišćenja.`;
  }

  return `Status pretplate nije jasno prepoznat. Proveriti Lemon Squeezy i subscriptions tabelu.`;
}

function formatDate(value: string | null | undefined) {
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
  if (status === "reset_blocked") return "Reset cooldown";
  return status ?? "-";
}

function deviceStatusTone(status: string | null): "green" | "red" | "yellow" | "blue" | "gray" {
  if (status === "active") return "green";
  if (status === "passive") return "gray";
  if (status === "reset_blocked") return "yellow";
  return "gray";
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
  if (err === "multiple_owner_orgs_detected") return "Pronađeno je više owner organizacija za isti nalog.";
  if (err === "downgrade_scheduling_not_ready") return "Downgrade će biti omogućen nakon uvođenja zakazanog smanjenja plana.";
  return err;
}

const pageStyle: React.CSSProperties = {
  padding: 32,
  maxWidth: 1180,
  margin: "0 auto",
  color: "#111827",
  fontFamily:
    'Arial, "Helvetica Neue", Helvetica, sans-serif',
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 20,
  alignItems: "flex-start",
  marginBottom: 24,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 32,
  letterSpacing: "-0.03em",
};

const subtitleStyle: React.CSSProperties = {
  margin: "8px 0 0 0",
  color: "#6b7280",
  fontSize: 15,
};

const userBoxStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
  minWidth: 260,
  background: "#ffffff",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
  marginBottom: 16,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 20,
  background: "#ffffff",
  marginBottom: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 16,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
};

const mutedTextStyle: React.CSSProperties = {
  margin: "6px 0 0 0",
  color: "#6b7280",
  lineHeight: 1.5,
};

const labelStyle: React.CSSProperties = {
  margin: 0,
  color: "#6b7280",
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const valueStyle: React.CSSProperties = {
  margin: "6px 0 0 0",
  fontSize: 18,
  fontWeight: 800,
};

const licenseCodeStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  padding: "10px 12px",
  borderRadius: 10,
  background: "#f3f4f6",
  border: "1px solid #e5e7eb",
  fontWeight: 800,
  wordBreak: "break-word",
};

const factsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const factStyle: React.CSSProperties = {
  padding: 14,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#f9fafb",
};

const billingBoxStyle: React.CSSProperties = {
  marginTop: 20,
  padding: 16,
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "#f9fafb",
};

const actionRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 14,
};

const selectStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  minWidth: 190,
  background: "#ffffff",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  fontWeight: 700,
  cursor: "pointer",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #b91c1c",
  background: "#b91c1c",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};

const actionLinkStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  border: "1px solid #d1d5db",
  background: "white",
  color: "#111827",
  fontWeight: 800,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #e5e7eb",
  padding: 10,
  background: "#f9fafb",
  color: "#374151",
  fontSize: 13,
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
  padding: 10,
  verticalAlign: "top",
  fontSize: 14,
};

const infoBoxStyle: React.CSSProperties = {
  marginTop: 20,
  padding: 16,
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  borderRadius: 14,
  lineHeight: 1.6,
};

const explainTextStyle: React.CSSProperties = {
  margin: "0 0 8px 0",
  color: "#374151",
};

const alertSuccessStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 14,
  borderRadius: 12,
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
};

const alertDangerStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 14,
  borderRadius: 12,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
};

const alertInfoStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 14,
  borderRadius: 12,
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1e40af",
};

function pillStyle(tone: "green" | "red" | "yellow" | "blue" | "gray"): React.CSSProperties {
  const colors = {
    green: {
      background: "#dcfce7",
      border: "#86efac",
      color: "#166534",
    },
    red: {
      background: "#fee2e2",
      border: "#fecaca",
      color: "#991b1b",
    },
    yellow: {
      background: "#fef3c7",
      border: "#fde68a",
      color: "#92400e",
    },
    blue: {
      background: "#dbeafe",
      border: "#bfdbfe",
      color: "#1e40af",
    },
    gray: {
      background: "#f3f4f6",
      border: "#e5e7eb",
      color: "#374151",
    },
  }[tone];

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${colors.border}`,
    background: colors.background,
    color: colors.color,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: ".04em",
    whiteSpace: "nowrap",
  };
}

function subscriptionNoticeStyle(status: UiSubscriptionStatus): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: 14,
    borderRadius: 12,
    lineHeight: 1.55,
    fontWeight: 700,
  };

  if (status === "active") {
    return {
      ...base,
      background: "#f0fdf4",
      border: "1px solid #bbf7d0",
      color: "#166534",
    };
  }

  if (status === "cancelled") {
    return {
      ...base,
      background: "#fffbeb",
      border: "1px solid #fde68a",
      color: "#92400e",
    };
  }

  if (status === "expired" || status === "payment_failed") {
    return {
      ...base,
      background: "#fef2f2",
      border: "1px solid #fecaca",
      color: "#991b1b",
    };
  }

  return {
    ...base,
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    color: "#374151",
  };
}
