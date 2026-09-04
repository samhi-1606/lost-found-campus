import { Link, useParams } from "react-router-dom";
import { matches } from "../data/mockData";
import ConfidenceScore from "../components/ConfidenceScore";
import Icon from "../components/Icon";

export default function MatchDetails() {
  const { id } = useParams();
  const match = matches.find(m => m.id === id) || matches[0];
  return (
    <>
      <Link to="/matches" className="back-link">← Potential matches</Link>
      <div className="detail-heading"><div><span className="eyebrow">MATCH {match.id}</span><h1>Something looks promising.</h1><p>We found a possible connection for your report. The next step is ownership verification.</p></div><span className="big-score">{match.confidence}%</span></div>
      <div className="verification-preview">
        <section className="panel match-summary"><div className="large-item-image">{match.icon}</div><div><span className="eyebrow">POSSIBLE FOUND ITEM</span><h2>{match.item}</h2><p>General location: {match.location}<br />Reported around: {match.date}</p><ConfidenceScore value={match.confidence} /></div></section>
        <section className="panel"><span className="eyebrow">WHAT LINES UP</span><h2>Matching signals</h2><div className="signal-list">{match.attributes.map(a => <div key={a}><span className="signal-check">✓</span><div><strong>{a}</strong><small>Consistent with your report</small></div></div>)}</div></section>
      </div>
      <div className="privacy-note"><Icon name="lock" size={18} /><div><strong>You’ll see “Verified Campus Member” — not a phone number or personal email.</strong><p>Your contact details stay private until the handover process is completed. If this feels like your item, continue to the ownership questions.</p></div></div>
      <div className="center-action"><Link to="/verification" className="button button-primary">Start ownership verification <Icon name="arrow" size={17} /></Link></div>
    </>
  );
}