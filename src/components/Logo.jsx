import { Link } from "react-router-dom";

export default function Logo({ compact = false }) {
  return (
    <Link to="/dashboard" className="logo" aria-label="CampusFind home">
      <span className="logo-mark">C</span>
      {!compact && <span><strong>Campus</strong>Find</span>}
    </Link>
  );
}