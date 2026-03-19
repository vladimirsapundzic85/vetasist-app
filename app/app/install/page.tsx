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
              <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 22, fontWeight: 800 }}>
                Instalacija ekstenzije
              </h3>

              <p style={{ marginTop: 0, color: "#4b5563", lineHeight: 1.7 }}>
                Instalacioni link će uskoro biti dostupan. Do tada koristi glavno okruženje.
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
                Idi na početnu stranu
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
              <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 22, fontWeight: 800 }}>
                Podrška
              </h3>

              <p style={{ marginTop: 0, color: "#4b5563", lineHeight: 1.7 }}>
                Ako nešto ne radi ili ne znaš kako dalje – javi se.
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

          {/* VAŽNO */}
          <div
            style={{
              marginTop: 24,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 18,
              padding: 24,
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 22, fontWeight: 800 }}>
              Važno
            </h3>

            <p style={{ margin: 0, color: "#1e3a8a", lineHeight: 1.7 }}>
              Licencu možeš proslediti drugim korisnicima iz organizacije. Broj uređaja zavisi od plana.
            </p>
          </div>

          {/* FAQ */}
          <div
            style={{
              marginTop: 32,
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 18,
              padding: 28,
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 20, fontSize: 28, fontWeight: 800 }}>
              Česta pitanja
            </h2>

            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <strong>Ne mogu da aktiviram licencu</strong>
                <p style={{ margin: "6px 0 0", color: "#4b5563" }}>
                  Proveri da li si kopirao licencu bez razmaka. Ako i dalje ne radi – verovatno je popunjen limit uređaja.
                </p>
              </div>

              <div>
                <strong>Šta znači limit uređaja?</strong>
                <p style={{ margin: "6px 0 0", color: "#4b5563" }}>
                  Svaki plan ima ograničen broj uređaja. Ako je limit popunjen, novi korisnik neće moći da se prijavi dok se ne oslobodi mesto.
                </p>
              </div>

              <div>
                <strong>Kako da resetujem uređaj?</strong>
                <p style={{ margin: "6px 0 0", color: "#4b5563" }}>
                  Instalacioni link će uskoro biti dostupan na ovoj strani. Do tada prati uputstvo iz emaila i koristi VetAssist alat nakon unosa licence.
                </p>
              </div>

              <div>
                <strong>Kako da podelim licencu kolegama?</strong>
                <p style={{ margin: "6px 0 0", color: "#4b5563" }}>
                  Samo im prosledi email koji si dobio. Oni unose isti ključ u ekstenziji.
                </p>
              </div>

              <div>
                <strong>Kako da otkažem pretplatu?</strong>
                <p style={{ margin: "6px 0 0", color: "#4b5563" }}>
                  Pretplata se otkazuje preko linka iz emaila ili kontaktiranjem podrške.
                </p>
              </div>

              <div>
                <strong>Ekstenzija ne radi na AIRS-u</strong>
                <p style={{ margin: "6px 0 0", color: "#4b5563" }}>
                  Proveri da li si na pravoj stranici AIRS-a i da li je ekstenzija aktivna u browseru.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
