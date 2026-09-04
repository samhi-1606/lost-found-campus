import { Link, useParams } from "react-router-dom";
import { reports } from "../data/mockData";
import StatusBadge from "../components/StatusBadge";
import Icon from "../components/Icon";

export default function ReportDetails() {
  const { id } = useParams();
  const report = reports.find(r => r.id === id) || reports[0];
  return (
    <>
      <Link to="/my-reports" className="back-link">← My reports</Link>
      <div className="detail-heading"><div><span className="eyebrow">{report.type} REPORT · {report.id}</span><h1>{report.item}</h1><p>{report.description}</p></div><StatusBadge tone={report.status === "Resolved" ? "success" : "warning"}>{report.status}</StatusBadge></div>
      <div className="detail-grid">
        <section className="panel detail-card"><div className="large-item-image">{report.icon}</div><div className="detail-info"><div><span>Category</span><strong>{report.category}</strong></div><div><span>Location</span><strong>{report.location}</strong></div><div><span>Date</span><strong>{report.date}</strong></div></div></section>
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">CASE TIMELINE</span><h2>What’s happening</h2></div></div><div className="timeline"><div><b>Report created</b><span>Information submitted to CampusFind</span><small>Today · 10:14 AM</small></div><div><b>AI analysis</b><span>Attributes are ready for matching</span><small>Today · 10:16 AM</small></div><div><b>Potential match</b><span>There is a promising possibility to review</span><small>Today · 10:27 AM</small></div></div><Link to="/matches" className="button button-primary full">Review potential matches</Link></section>
      </div>
      <div className="privacy-note"><Icon name="lock" size={18} /><div><strong>Some details are intentionally hidden.</strong><p>Private identifiers are reserved for the ownership verification step.</p></div></div>
    </>
  );
}