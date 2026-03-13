export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = String(params?.email || "").trim();

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "40px auto",
        padding: "0 16px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ marginBottom: 12 }}>Kupovina uspešna</h1>

      <p style={{ marginBottom: 24 }}>
        Tvoja VetAssist kupovina je evidentirana.
      </p>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 20,
          background: "#fafafa",
        }}
      >
        <p style={{ marginTop: 0 }}>
          <strong>Status:</strong> uplata je uspešno primljena.
        </p>

        {email ? (
          <p>
            <strong>Email kupovine:</strong> {email}
          </p>
        ) : (
          <p>
            Email nije prosleđen u success linku.
          </p>
        )}

        <p style={{ marginBottom: 0 }}>
          Aktivacija licence i prikaz licence više se ne rade preko javnog prikaza po email adresi.
        </p>
      </div>

      <div
        style={{
          marginTop: 20,
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 20,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Dalji koraci</h2>
        <ol>
          <li>Sačuvaj potvrdu o kupovini.</li>
          <li>Sačekaj da se obradi aktivacija pretplate.</li>
          <li>License key će biti isporučen sigurnijim kanalom.</li>
        </ol>
      </div>

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
    </main>
  );
}
