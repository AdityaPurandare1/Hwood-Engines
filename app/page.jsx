export const metadata = {
  title: "Hwood Engines",
  description: "Operational engines for Hwood Group venues.",
};

const engines = [
  {
    name: "Keva",
    tagline: "Production Capacity Planner",
    description:
      "Depletion-weighted production capacity planning. Models bartender throughput, prep load, and shift mix to flag bottlenecks before service.",
    href: "/keva/",
  },
  {
    name: "Inventory Workflow",
    tagline: "Stock Movement & Reconciliation",
    description:
      "End-to-end inventory workflow — receive, transfer, count, reconcile. Surfaces variance, shrinkage, and slow-movers across venues.",
    href: "/inventory/index.html",
  },
  {
    name: "Procurement Engine",
    tagline: "Min/Max + Warehouse s/S",
    description:
      "Dual-loop procurement: venue Min/Max plus warehouse s/S. Computes reorder points, first orders, stress tests, and TCO targets.",
    href: "/procurement/index.html",
  },
];

export default function Landing() {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,700&family=Playfair+Display:wght@700;900&display=swap"
        rel="stylesheet"
      />
      <main style={styles.main}>
        <header style={styles.header}>
          <div style={styles.brand}>
            <span style={styles.brandMark}>HWOOD</span>
            <span style={styles.brandSep}>·</span>
            <span style={styles.brandLine}>ENGINES</span>
          </div>
          <p style={styles.subtitle}>
            Operational engines for Hwood Group venues.
          </p>
        </header>

        <section style={styles.grid}>
          {engines.map((e) => (
            <a key={e.name} href={e.href} style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardTitle}>{e.name}</h2>
                <span style={styles.cardArrow}>→</span>
              </div>
              <div style={styles.cardTagline}>{e.tagline}</div>
              <p style={styles.cardDesc}>{e.description}</p>
            </a>
          ))}
        </section>

        <footer style={styles.footer}>
          <span>HWOOD GROUP</span>
        </footer>
      </main>
    </>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    background: "#0a0a0a",
    color: "#e8e8e8",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    padding: "80px 40px 40px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  header: {
    textAlign: "center",
    marginBottom: 80,
    maxWidth: 720,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 24,
  },
  brandMark: {
    fontFamily: "'Playfair Display', serif",
    fontWeight: 900,
    fontSize: 48,
    letterSpacing: "0.04em",
    color: "#e8e8e8",
  },
  brandSep: {
    color: "#c9a84c",
    fontSize: 32,
  },
  brandLine: {
    fontWeight: 500,
    fontSize: 24,
    letterSpacing: "0.32em",
    color: "#c9a84c",
  },
  subtitle: {
    color: "#888",
    fontSize: 16,
    margin: 0,
    fontWeight: 400,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 24,
    width: "100%",
    maxWidth: 1100,
    marginBottom: 80,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    background: "#141414",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    padding: 32,
    textDecoration: "none",
    color: "inherit",
    transition: "border-color 0.2s, transform 0.2s",
    cursor: "pointer",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: {
    fontFamily: "'Playfair Display', serif",
    fontWeight: 700,
    fontSize: 28,
    margin: 0,
    color: "#e8e8e8",
  },
  cardArrow: {
    color: "#c9a84c",
    fontSize: 20,
  },
  cardTagline: {
    color: "#c9a84c",
    fontSize: 12,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    marginBottom: 20,
    fontWeight: 500,
  },
  cardDesc: {
    color: "#888",
    fontSize: 14,
    lineHeight: 1.6,
    margin: 0,
  },
  footer: {
    marginTop: "auto",
    paddingTop: 40,
    color: "#555",
    fontSize: 11,
    letterSpacing: "0.24em",
    fontWeight: 500,
  },
};
