async function getLicenseByEmail(email: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://vetasist-app.vercel.app";

  const res = await fetch(
    `${baseUrl}/api/license/by-email?email=${encodeURIComponent(email)}`,
    { cache: "no-store" }
  );

  if (!res.ok) return null;

  const json = await res.json();
  return json?.ok ? json.data : null;
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = String(params?.email || "").trim();
  const license = email ? await getLicenseByEmail(email) : null;

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: "0 16px", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ marginBottom: 12 }}>Kupovina uspešna</h1>
      <p style={{ marginBottom: 24 }}>
        VetAssist licenca je uspešno kreirana.
      </p>

      {!email ? (
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16 }}>
          <p style={{ marginTop: 0, fontWeight: 700 }}>Nedostaje email u linku.</p>
          <p>
            Otvori ovu stranicu sa parametrom:
          </p>
          <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8, overflowX: "auto" }}>
{`/success?email=tvoj@email.com`}
          </pre>
        </div>
      ) : !license ? (
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16 }}>
          <p style={{ marginTop: 0, fontWeight: 700 }}>Licenca još nije pronađena.</p>
          <p>
            Email: <strong>{email}</strong>
          </p>
          <p>
            Ako je kupovina upravo završena, sačekaj nekoliko sekundi i osveži stranicu.
          </p>
        </div>
      ) : (
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 20 }}>
          <p><strong>Vlasnik licence:</strong> {license.owner_name}</p>
          <p><strong>Email:</strong> {license.owner_email}</p>
          <p><strong>Plan:</strong> {license.plan}</p>
          <p><strong>Dozvoljeno uređaja:</strong> {license.device_limit}</p>
          <p><strong>Status pretplate:</strong> {license.subscription_status || "n/a"}</p>
          <p><strong>Važi do:</strong> {license.valid_until || "n/a"}</p>

          <div
            style={{
              marginTop: 20,
              marginBottom: 20,
              padding: 16,
              background: "#f6f6f6",
              borderRadius: 10,
              border: "1px solid #e5e5e5",
            }}
          >
            <div style={{ marginBottom: 8, fontWeight: 700 }}>Tvoj license key</div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: 1,
                wordBreak: "break-word",
              }}
            >
              {license.license_key}
            </div>
          </div>

          <h2 style={{ marginTop: 0 }}>Dalji koraci</h2>
          <ol>
            <li>Instaliraj VetAssist ekstenziju.</li>
            <li>Otvori AIRS stranicu.</li>
            <li>Unesi license key i sačuvaj licencu.</li>
          </ol>

          <div style={{ marginTop: 20 }}>
            <a
              href="https://vetasist.carrd.co/"
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                padding: "12px 18px",
                borderRadius: 8,
                textDecoration: "none",
                border: "1px solid #222",
                color: "#222",
                fontWeight: 700,
              }}
            >
              Otvori VetAssist sajt
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
