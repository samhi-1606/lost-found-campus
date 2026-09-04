import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import ConfidenceScore from "../components/ConfidenceScore";

const attrs = [["Category", "Backpack"], ["Color", "Navy blue"], ["Brand", "Nike"], ["Material", "Canvas"], ["Shape", "Rectangular"], ["Size", "Medium"], ["Text", "Small stitched patch"]];

export default function AIAnalysis() {
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">AI-ASSISTED ANALYSIS</span><h1>We’ve looked at the details.</h1><p>This is a frontend preview of the analysis your backend will eventually receive from Featherless AI.</p></div></div>
      <div className="analysis-layout">
        <section className="panel">
          <div className="analysis-status"><div className="status-check">✓</div><div><strong>Analysis complete</strong><span>Attributes extracted successfully</span></div><span className="status-time">2.4s</span></div>
          <div className="attribute-grid">{attrs.map(([a,b]) => <div className="attribute" key={a}><span>{a}</span><strong>{b}</strong></div>)}</div>
          <div className="analysis-location"><Icon name="map" size={18} /><div><span>Reported location</span><strong>Central Library · near the steps</strong></div></div>
        </section>
        <aside className="panel analysis-side"><span className="eyebrow">SEARCH SIGNAL</span><h2>91% confidence</h2><p>The current report has enough useful attributes to begin looking for similar cases.</p><ConfidenceScore value={91} /><div className="mini-list"><span>✓ Image characteristics</span><span>✓ Text attributes</span><span>✓ Location context</span><span>✓ Time context</span></div><Link to="/matches" className="button button-primary full">See potential matches</Link></aside>
      </div>
      <div className="process-note"><Icon name="lock" size={18} /><p><strong>Backend note:</strong> The real Featherless request should happen on a secure server, never directly from this React app.</p></div>
    </>
  );
}