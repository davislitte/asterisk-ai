import { DEFAULT_ALLOWLIST } from "@asterisk/shared";

// Placeholder until the join flow and allowlist gating land (Day 3).
export function App() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>Asterisk</h1>
      <p style={{ color: "#555" }}>
        Your teacher's AI study helper. Default allowed site: {DEFAULT_ALLOWLIST.join(", ")}
      </p>
    </main>
  );
}
