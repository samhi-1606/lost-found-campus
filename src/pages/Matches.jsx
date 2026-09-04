import { Link } from "react-router-dom";
import ConfidenceScore from "../components/ConfidenceScore";
import { matches } from "../data/mockData";

export default function Matches() {
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">PRIVATE MATCHING</span><h1>Potential matches</h1><p>These are possibilities, not proof of ownership. Verification comes next.</p></div></div>
      <div className="match-banner"><span>2</span><div><strong>Two promising possibilities</strong><p>We show only general information until a verification step is started.</p></div></div>
      <div className="matches-grid">{matches.map(m => <article className="match-card" key={m.id}><div className="match-card-top"><div className="large-match-icon">{m.icon}</div><span className="match-score">{m.confidence}%</span></div><span className="eyebrow">POTENTIAL MATCH</span><h2>{m.item}</h2><p>{m.note}</p><div className="match-meta"><span>📍 {m.location}</span><span>◷ {m.date}</span></div><ConfidenceScore value={m.confidence} /><div className="attribute-chips">{m.attributes.map(a => <span key={a}>✓ {a}</span>)}</div><Link to={`/matches/${m.id}`} className="button button-primary full">View match</Link></article>)}</div>
    </>
  );
}