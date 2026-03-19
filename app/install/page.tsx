export default function InstallPage() {
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
        <div style={{ maxWidth: 980, margin: "0 auto", textAlign: "center" }}>
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
            VetAssist • Instalacija
          </div>

          <h1
            style={{
              fontSize: 42,
              lineHeight: 1.1,
              margin: "0 0 16px",
              fontWeight: 800,
            }}
          >
            Instalacija i prvi koraci
          </h1>

          <p
            style={{
              maxWidth: 760,
              margin: "0 auto",
              fontSize: 18,
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.92)",
            }}
          >
            Ovde su koraci koje treba da pratiš nakon kupovine kako bi što brže
            aktivirao VetAssist i počeo da koristiš alate.
          </p>
        </div>
      </section>

      <section style={{ padding: "56px 20px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div
            style={{
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 18,
              padding: 28,
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.06)",
              marginBottom: 24,
            }}
          >
            <h2
              style={{
                marginTop: 0,
                marginBottom: 16,
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              Koraci za početak
            </h2>

            <ol
              style={{
                margin: 0,
                paddingLeft: 22,
                lineHeight: 1.9,
                fontSize: 17,
              }}
            >
              <li>Instaliraj VetAssist ekstenziju.</li>
              <li>Otvori ekstenziju u browseru.</li>
              <li>Unesi licencu koju si dobio na email.</li>
              <li>Otvori AIRS.</li>
              <li>Pokreni alat koji želiš da koristiš.</li>
            </ol>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 20,
            }}
          >
            <div
              style={{
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: 18,
                padding: 24,
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: 12,
                  fontSize: 22,
                  fontWeight: 800,
                }}
              >
                Instalacija ekstenzije
              </h3>

              <p
                style={{
                  marginTop: 0,
                  color: "#4b5563",
                  lineHeight: 1.7,
                  fontSize: 16,
                }}
              >
                Instalacioni link će uskoro biti dostupan na posebnoj stranici.
                Do tada koristi glavno VetAssist okruženje i prati uputstvo koje
                si dobio na email.
              </p>

              <a
                href="https://vetasist.net"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-block",
                  padding: "12px 18px",
                  borderRadius: 10,
                  textDecoration: "none",
                  background: "#111827",
                  color: "white",
                  fontWeight: 700,
                }}
              >
                Otvori VetAssist
              </a>
            </div>

            <div
              style={{
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: 18,
                padding: 24,
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: 12,
                  fontSize: 22,
                  fontWeight: 800,
                }}
              >
                Podrška
              </h3>

              <p
                style={{
                  marginTop: 0,
                  color: "#4b5563",
                  lineHeight: 1.7,
                  fontSize: 16,
                }}
              >
                Ako nešto ne radi, ako ne možeš da aktiviraš licencu ili nisi
                siguran kako da kreneš, javi se i rešavamo problem korak po
                korak.
              </p>

              <a
                href="mailto:vladimirsapundzic@gmail.com"
                style={{
                  display: "inline-block",
                  padding: "12px 18px",
                  borderRadius: 10,
                  textDecoration: "none",
                  background: "white",
                  color: "#111827",
                  fontWeight: 700,
                  border: "1px solid #d1d5db",
                }}
              >
                Kontakt podrška
              </a>
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
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
              }}
            >
              Važno
            </h3>

            <p
              style={{
                margin: 0,
                color: "#1e3a8a",
                lineHeight: 1.7,
                fontSize: 16,
              }}
            >
              Licencu možeš proslediti i drugim korisnicima iz svoje
              organizacije, ali će pristup zavisiti od limita uređaja iz plana
              koji je kupljen.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
