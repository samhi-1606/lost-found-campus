import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";

export default function ReportCard({ report }) {
  const tone = report.status === "Resolved" ? "success" : report.status === "Potential match" ? "warning" : "neutral";
  return (
    <Link to={`/reports/${report.id}`} className="report-card">
      <div className="report-icon">{report.icon}</div>
      <div className="report-main">
        <div className="card-row">
          <span className="eyebrow">{report.type} report</span>
          <StatusBadge tone={tone}>{report.status}</StatusBadge>
        </div>
        <h3>{report.item}</h3>
        <p>{report.category} · {report.location}</p>
        <small>{report.date}</small>
      </div>
      <span className="card-arrow">›</span>
    </Link>
  );
}