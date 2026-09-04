export default function ConfidenceScore({ value }) {
  return (
    <div className="confidence">
      <div className="confidence-head">
        <span>Potential match</span>
        <strong>{value}%</strong>
      </div>
      <div className="confidence-track">
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}