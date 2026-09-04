export default function SafetyBadge({ tone = "safe", children }) {
  return <span className={`safety-badge tone-${tone}`}>{children}</span>;
}
