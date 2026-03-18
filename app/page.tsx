"use client";
export default function HomePage() {
  async function handleCheckout(plan: string) {
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();

      if (!data.ok) {
        alert(data.message || data.error);
        if (data.redirect) {
          window.location.href = data.redirect;
        }
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      alert("Greška pri pokretanju checkout-a.");
    }
  }

  return (
    <main
      style={{
        fontFamily: 'Arial, sans-serif',
        color: '#1f2937',
        background: '#f8fafc',
      }}
    >
      <section
        style={{
          background:
            'linear-gradient(135deg, #0f172a 0%, #1e3a8a 45%, #0ea5e9 100%)',
          color: 'white',
          padding: '72px 20px 56px',
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1.2fr 0.8fr',
            gap: 32,
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-block',
                padding: '8px 12px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.12)',
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 18,
              }}
            >
              VetAssist • AIRS automatizacija
            </div>

            <h1
              style={{
                fontSize: 52,
                lineHeight: 1.05,
                margin: '0 0 18px',
                fontWeight: 800,
                letterSpacing: -1,
              }}
            >
              Prekini ručni rad u AIRS-u.
            </h1>

            <p
              style={{
                fontSize: 20,
                lineHeight: 1.6,
                margin: '0 0 26px',
                maxWidth: 760,
                color: 'rgba(255,255,255,0.92)',
              }}
            >
              VetAssist je skup alata za veterinarske službe i odgajivačke
              organizacije koji automatizuje pretragu, obradu i izvoz podataka
              iz AIRS-a i srodnih evidencija.
            </p>

            <div
              style={{
                display: 'flex',
                gap: 14,
                flexWrap: 'wrap',
                marginBottom: 18,
              }}
            >
              <a
                href="/app"
                style={{
                  display: 'inline-block',
                  padding: '14px 20px',
                  borderRadius: 10,
                  textDecoration: 'none',
                  background: 'white',
                  color: '#111827',
                  fontWeight: 700,
                  border: '1px solid white',
                }}
              >
                Otvori aplikaciju
              </a>

              <a
                href="#pricing"
                style={{
                  display: 'inline-block',
                  padding: '14px 20px',
                  borderRadius: 10,
                  textDecoration: 'none',
                  background: 'transparent',
                  color: 'white',
                  fontWeight: 700,
                  border: '1px solid rgba(255,255,255,0.45)',
                }}
              >
                Pogledaj cenu
              </a>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 18,
                flexWrap: 'wrap',
                fontSize: 15,
                color: 'rgba(255,255,255,0.9)',
              }}
            >
              <span>✔ Brža obrada zahteva</span>
              <span>✔ Manje grešaka u radu</span>
              <span>✔ Izvoz u Excel / CSV</span>
            </div>
          </div>

          <div
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 18,
              padding: 24,
              boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div
              style={{
                fontSize: 14,
                opacity: 0.9,
                marginBottom: 8,
                fontWeight: 700,
              }}
            >
              Šta VetAssist rešava
            </div>

            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                lineHeight: 1.8,
                fontSize: 16,
              }}
            >
              <li>ponavljanje istih AIRS upita iz dana u dan</li>
              <li>ručno prepisivanje i lepljenje podataka</li>
              <li>sporo formiranje izveštaja za organizacije</li>
              <li>gubljenje vremena na kontrolne preglede</li>
              <li>greške koje nastaju zbog ručne obrade</li>
            </ul>

            <div
              style={{
                marginTop: 20,
                paddingTop: 18,
                borderTop: '1px solid rgba(255,255,255,0.15)',
                fontSize: 15,
                lineHeight: 1.7,
                color: 'rgba(255,255,255,0.92)',
              }}
            >
              Rezultat: manje kliktanja, manje prepisivanja, više gotovih
              rezultata za isto vreme.
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: '56px 20px', background: 'white' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <h2
            style={{
              fontSize: 34,
              margin: '0 0 12px',
              fontWeight: 800,
              textAlign: 'center',
            }}
          >
            Za koga je VetAssist
          </h2>

          <p
            style={{
              textAlign: 'center',
              color: '#4b5563',
              fontSize: 18,
              margin: '0 auto 34px',
              maxWidth: 760,
              lineHeight: 1.6,
            }}
          >
            Napravljen za službe koje rade veliki broj ponovljivih provera,
            evidencija i izveštaja i više ne žele da troše sate na ručni rad.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 20,
            }}
          >
            <InfoCard
              title="Veterinarske službe"
              text="Brza obrada spiskova, provera stanja, priprema rezultata i manje ručne administracije."
            />
            <InfoCard
              title="Odgajivačke organizacije"
              text="Automatizacija kontrola, izvoza i pripreme podataka za dalju obradu i izveštavanje."
            />
            <InfoCard
              title="Administrativni timovi"
              text="Manje ponavljanja istih koraka, manje kopiranja podataka i manje prostora za grešku."
            />
          </div>
        </div>
      </section>

      <section style={{ padding: '56px 20px', background: '#eef2ff' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <h2
            style={{
              fontSize: 34,
              margin: '0 0 32px',
              fontWeight: 800,
              textAlign: 'center',
            }}
          >
            Šta dobijaš
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 20,
            }}
          >
            <FeatureCard
              title="Automatizovane pretrage"
              text="Alati izvršavaju ponovljive AIRS postupke umesto korisnika i smanjuju broj ručnih klikova."
            />
            <FeatureCard
              title="Izvoz rezultata"
              text="Rezultati se pripremaju za Excel i dalju obradu umesto da ih ručno sastavljaš svaki put."
            />
            <FeatureCard
              title="Standardizovan proces"
              text="Isti zadatak se izvršava istim redosledom koraka svaki put, bez improvizacije."
            />
            <FeatureCard
              title="Kontrola pristupa"
              text="Pristup alatima je vezan za licencu, plan i ograničenje broja uređaja."
            />
          </div>
        </div>
      </section>

      <section id="pricing" style={{ padding: '64px 20px', background: 'white' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', textAlign: 'center' }}>
          <h2
            style={{
              fontSize: 34,
              margin: '0 0 12px',
              fontWeight: 800,
            }}
          >
            Planovi i cene
          </h2>

          <p
            style={{
              color: '#4b5563',
              fontSize: 18,
              margin: '0 auto 30px',
              maxWidth: 720,
              lineHeight: 1.6,
            }}
          >
            VetAssist se naplaćuje po organizaciji, uz planove prilagođene
            broju uređaja i obimu rada.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 20,
              marginTop: 20,
            }}
          >{[
  {
    id: 'basic',
    name: 'Basic',
    price: '15€',
    desc: 'Osnovni alati, manji obim rada i početak automatizacije za organizacije koje žele jednostavan ulazak u sistem.',
  },
  {
    id: 'team',
    name: 'Team',
    price: '35€',
    desc: 'Više uređaja i bolji kapacitet za timove koji rade veći broj svakodnevnih provera i izveštaja.',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '75€',
    desc: 'Napredni alati i maksimalna brzina rada za ozbiljan svakodnevni operativni rad.',
    highlight: true,
  },
  {
    id: 'exclusive',
    name: 'Exclusive',
    price: '180€',
    desc: 'Pun pristup, najveći kapacitet i prioritet za organizacije koje žele maksimum bez ograničavanja rada.',
  },
  {
    id: 'pro_test',
    name: 'Pro TEST',
    price: '75€',
    desc: 'Privremeni test plan za proveru checkout i webhook toka. Ovaj plan se kasnije uklanja.',
  },
].map((plan) => (
              <div
                key={plan.id}
                style={{
                  border: plan.highlight ? '2px solid #2563eb' : '1px solid #dbeafe',
                  borderRadius: 18,
                  padding: 24,
                  background: plan.highlight ? '#eff6ff' : 'white',
                  textAlign: 'left',
                  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.08)',
                }}
              >
                <h3
                  style={{
                    margin: '0 0 10px',
                    fontSize: 24,
                    fontWeight: 800,
                  }}
                >
                  {plan.name}
                </h3>

                <div
                  style={{
                    fontSize: 42,
                    fontWeight: 800,
                    lineHeight: 1,
                    marginBottom: 10,
                  }}
                >
                  {plan.price}
                  <span
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: '#6b7280',
                    }}
                  >
                    {' '}
                    / mesečno
                  </span>
                </div>

                <p
                  style={{
                    color: '#4b5563',
                    fontSize: 16,
                    lineHeight: 1.7,
                    marginBottom: 18,
                  }}
                >
                  {plan.desc}
                </p>

                <button
                  onClick={() => handleCheckout(plan.id)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: '#111827',
                    color: 'white',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Kupi plan
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '64px 20px', background: '#0f172a', color: 'white' }}>
        <div
          style={{
            maxWidth: 980,
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontSize: 34,
              margin: '0 0 14px',
              fontWeight: 800,
            }}
          >
            Prestani da trošiš sate na iste AIRS korake.
          </h2>

          <p
            style={{
              maxWidth: 760,
              margin: '0 auto 24px',
              fontSize: 18,
              lineHeight: 1.7,
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            VetAssist je napravljen da skine najdosadniji deo posla sa ljudi koji
            svakodnevno rade proveru, obradu i izvoz podataka.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 14,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <a
              href="/app"
              style={{
                display: 'inline-block',
                padding: '14px 20px',
                borderRadius: 10,
                textDecoration: 'none',
                background: 'white',
                color: '#111827',
                fontWeight: 700,
                border: '1px solid white',
              }}
            >
              Idi na aplikaciju
            </a>

            <a
              href="mailto:vladimirsapundzic@gmail.com"
              style={{
                display: 'inline-block',
                padding: '14px 20px',
                borderRadius: 10,
                textDecoration: 'none',
                background: 'transparent',
                color: 'white',
                fontWeight: 700,
                border: '1px solid rgba(255,255,255,0.35)',
              }}
            >
              Kontakt
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}

function InfoCard({
  title,
  text,
}: {
  title: string
  text: string
}) {
  return (
    <div
      style={{
        background: '#f8fafc',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        padding: 22,
      }}
    >
      <h3
        style={{
          margin: '0 0 10px',
          fontSize: 22,
          fontWeight: 800,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: 0,
          color: '#4b5563',
          lineHeight: 1.7,
          fontSize: 16,
        }}
      >
        {text}
      </p>
    </div>
  )
}

function FeatureCard({
  title,
  text,
}: {
  title: string
  text: string
}) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #dbeafe',
        borderRadius: 16,
        padding: 22,
      }}
    >
      <h3
        style={{
          margin: '0 0 10px',
          fontSize: 22,
          fontWeight: 800,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: 0,
          color: '#4b5563',
          lineHeight: 1.7,
          fontSize: 16,
        }}
      >
        {text}
      </p>
    </div>
  )
}
