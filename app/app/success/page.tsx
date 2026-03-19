export default function SuccessPage() {
  return (
    <main
      style={{
        fontFamily: "Arial, sans-serif",
        background: "#f8fafc",
        color: "#1f2937",
        minHeight: "100vh",
      }}
    >
      <section
        style={{
          background:
            "linear-gradient(135deg, #0f172a 0%, #1e3a8a 45%, #0ea5e9 100%)",
          color: "white",
          padding: "72px 20px 56px",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <div
            style={{
              display: "inline-block",
              padding: "8px 12px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.12)",
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 18,
            }}
          >
            VetAssist • Kupovina završena
          </div>

          <h1
            style={{
              fontSize: 42,
              lineHeight: 1.1,
              margin: "0 0 16px",
              fontWeight: 800,
            }}
          >
            Kupovina je uspešno završena
          </h1>

          <p
            style={{
              maxWidth: 720,
              margin: "0 auto",
              fontSize: 18,
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.92)",
            }}
          >
            Licenca i uputstvo za instalaciju poslati su na email koji je
            korišćen pri kupovini.
          </p>
        </div>
      </section>

      <section style={{ padding: "56px 20px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div
            style={{
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 18,
              padding: 28,
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.06)",
              marginBottom: 24,
              textAlign: "center",
            }}
          >
            <h2
              style={{
                marginTop: 0,
                marginBottom: 14,
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              Sledeći korak
            </h2>

            <p
              style={{
                margin: "0 auto 14px",
                maxWidth: 700,
                color: "#4b5563",
                lineHeight: 1.7,
                fontSize: 17,
              }}
            >
              Otvori email, kopiraj licencu i prati kratko uputstvo za
              instalaciju i pokretanje VetAssist ekstenzije.
            </p>

            <p
              style={{
                margin: "0 auto 22px",
                maxWidth: 700,
                color: "#6b7280",
                lineHeight: 1.7,
                fontSize: 15,
              }}
            >
              Ako poruku ne vidiš odmah, proveri Spam / Promotions folder.
            </p>

            <div
              style={{
                display: "flex",
                gap: 14,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <a
                href="/install"
                style={{
                  display: "inline-block",
                  padding: "14px 20px",
                  borderRadius: 10,
                  textDecoration: "none",
                  background: "#111827",
                  color: "white",
                  fontWeight: 700,
                  border: "1px solid #111827",
                }}
              >
                Instalacija i prvi koraci
              </a>

              <a
                href="/app"
                style={{
                  display: "inline-block",
                  padding: "14px 20px",
                  borderRadius: 10,
                  textDecoration: "none",
                  background: "white",
                  color: "#111827",
                  fontWeight: 700,
                  border: "1px solid #d1d5db",
                }}
              >
                Otvori aplikaciju
              </a>
            </div>
          </div>

          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 18,
              padding: 24,
            }}
          >
            <h3
              style={{
                marginTop: 0,
                marginBottom: 10,
                fontSize: 22,
                fontWeight: 800,
                color: "#1e3a8a",
              }}
            >
              Nisi dobio email?
            </h3>

            <p
              style={{
                margin: 0,
                color: "#1e3a8a",
                lineHeight: 1.7,
                fontSize: 16,
              }}
            >
              Ako email sa licencom i uputstvom nije stigao u roku od nekoliko
              minuta, javi se na{" "}
              <a
                href="mailto:vladimirsapundzic@gmail.com"
                style={{ color: "#1d4ed8", fontWeight: 700 }}
              >
                vladimirsapundzic@gmail.com
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
