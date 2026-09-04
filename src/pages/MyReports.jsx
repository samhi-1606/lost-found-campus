import { useState } from "react";
import ReportCard from "../components/ReportCard";
import { reports } from "../data/mockData";

export default function MyReports() {
  const [filter, setFilter] = useState("All");
  const filtered = filter === "All" ? reports : reports.filter(r => r.type === filter);
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">YOUR ACTIVITY</span><h1>My reports</h1><p>Keep track of everything you have reported through CampusFind.</p></div></div>
      <div className="filter-bar"><div className="segmented">{["All", "Lost", "Found"].map(x => <button className={filter === x ? "selected" : ""} onClick={() => setFilter(x)} key={x}>{x}</button>)}</div><div className="search-field">⌕ <input placeholder="Search reports" /></div></div>
      <section className="reports-page-grid">{filtered.map(r => <ReportCard key={r.id} report={r} />)}</section>
      <div className="empty-soft"><div>📚</div><strong>Every report has a story.</strong><p>Resolved cases stay here so you can look back on them.</p></div>
    </>
  );
}