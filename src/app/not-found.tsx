export default function NotFoundPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <section
        style={{
          width: "min(32rem, 100%)",
          borderRadius: "1.75rem",
          border: "1px solid rgba(143, 176, 199, 0.18)",
          background: "rgba(4, 16, 26, 0.9)",
          boxShadow: "0 18px 50px rgba(0, 0, 0, 0.28)",
          padding: "2rem",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#4ecdc4",
            fontFamily: "var(--font-heading), sans-serif",
            fontSize: "0.95rem",
            letterSpacing: "0.28em",
            textTransform: "uppercase",
          }}
        >
          Access Denied
        </p>
        <h1
          style={{
            margin: "0.75rem 0 0.5rem",
            fontFamily: "var(--font-heading), sans-serif",
            fontSize: "3rem",
            letterSpacing: "0.06em",
          }}
        >
          404
        </h1>
        <p
          style={{
            margin: 0,
            color: "#8fb0c7",
            fontSize: "1rem",
            lineHeight: 1.6,
          }}
        >
          This dashboard only exists behind its shared secret path.
        </p>
      </section>
    </main>
  );
}
