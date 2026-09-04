import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import ReportCard from "../components/ReportCard";
import ConfidenceScore from "../components/ConfidenceScore";
import { reports, matches } from "../data/mockData";

export default function Dashboard() {
  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">TUESDAY, SEPTEMBER 4</span><h1>Good morning, Alex.</h1><p>Here’s what’s happening with your reports.</p></div>
        <Link to="/report-lost" className="button button-primary"><Icon name="plus" size={17} /> New report</Link>
      </div>

      <section className="welcome-panel">
        <div><div className="soft-pill">Your workspace</div><h2>Let’s get your things<br />back where they belong.</h2><p>Start a report or check whether we found a promising match.</p></div>
        <div className="welcome-actions"><Link to="/report-lost" className="action-tile"><span>🔎</span><strong>I lost something</strong><small>Tell us what went missing</small><Icon name="arrow" size={17} /></Link><Link to="/report-found" className="action-tile"><span>🤝</span><strong>I found something</strong><small>Help return it to its owner</small><Icon name="arrow" size={17} /></Link></div>
      </section>

      <div className="stats-grid">
        <div className="stat-card"><span>Active reports</span><strong>2</strong><small>1 lost · 1 found</small></div>
        <div className="stat-card"><span>Potential matches</span><strong>2</strong><small>1 needs your attention</small></div>
        <div className="stat-card"><span>Resolved cases</span><strong>4</strong><small>Nice work looking out for others</small></div>
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">YOUR REPORTS</span><h2>Recently updated</h2></div><Link to="/my-reports">View all →</Link></div>
          <div className="stack">{reports.slice(0, 3).map(r => <ReportCard key={r.id} report={r} />)}</div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">AI-ASSISTED SEARCH</span><h2>Promising matches</h2></div><Link to="/matches">See all →</Link></div>
          <div className="match-list">{matches.map(m => <Link className="match-mini" to={`/matches/${m.id}`} key={m.id}><div className="match-icon">{m.icon}</div><div><strong>{m.item}</strong><span>{m.location} · {m.date}</span><ConfidenceScore value={m.confidence} /></div></Link>)}</div>
        </section>
      </div>

      <div className="privacy-note"><Icon name="lock" size={18} /><div><strong>Your private details stay private.</strong><p>Potential matches show only enough information to help you decide whether to continue to verification.</p></div></div>
    </>
  );
}