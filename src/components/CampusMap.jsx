import { campusLocations, campusAvoidZones, handoverCase } from "../data/mockData";

function routePath(routeId, destination) {
  if (!destination) return "";
  const x = destination.x * 6.4;
  const y = destination.y * 3.6;
  if (routeId === "fastest") return `M 70 210 L 220 230 L ${x} ${y}`;
  if (routeId === "accessible") return `M 70 210 L 70 280 L 270 280 L ${x} ${y}`;
  return `M 70 210 C 160 210 190 140 250 110 S ${x - 50} ${y + 18} ${x} ${y}`;
}

export default function CampusMap({ destinationId, routeId = "safest", compact = false }) {
  const destination = campusLocations.find((place) => place.id === destinationId);

  return (
    <div className={`campus-map ${compact ? "compact" : ""}`}>
      <div className="campus-map-banner">Campus map prototype — not live GPS</div>
      <svg viewBox="0 0 640 360" role="img" aria-label="Mock campus map with a safer walking route">
        <rect width="640" height="360" rx="18" fill="#e7efe8" />
        <path d="M0 230h640M0 120h640M210 0v360M430 0v360" stroke="#d5e0d7" strokeWidth="18" />
        <rect x="24" y="24" width="150" height="78" rx="10" fill="#fbfaf5" stroke="#c9d6cc" />
        <rect x="200" y="40" width="130" height="70" rx="10" fill="#fbfaf5" stroke="#c9d6cc" />
        <rect x="360" y="28" width="120" height="64" rx="10" fill="#fbfaf5" stroke="#c9d6cc" />
        <rect x="500" y="22" width="116" height="70" rx="10" fill="#e4eee8" stroke="#8eae9b" />
        <rect x="240" y="200" width="150" height="68" rx="10" fill="#fbfaf5" stroke="#c9d6cc" />
        <rect x="30" y="230" width="110" height="58" rx="10" fill="#f7f1df" stroke="#e0cf9a" />
        <rect x="460" y="190" width="130" height="70" rx="10" fill="#f7f1df" stroke="#e0cf9a" />
        <rect x="530" y="290" width="86" height="46" rx="8" fill="#f3e0d8" stroke="#d7b0a0" />
        <circle cx="70" cy="210" r="28" fill="#dce8df" />
        <text x="48" y="52" className="map-label">Library</text>
        <text x="214" y="78" className="map-label">Student Services</text>
        <text x="386" y="62" className="map-label">Reception</text>
        <text x="516" y="58" className="map-label">Security</text>
        <text x="268" y="238" className="map-label">Cafeteria</text>
        <text x="50" y="262" className="map-label">Main Gate</text>
        {destination && (
          <path d={routePath(routeId, destination)} fill="none" stroke="#315d4d" strokeWidth="5" strokeLinecap="round" strokeDasharray="10 8" className="route-line" />
        )}
        <g className="map-start">
          <circle cx="70" cy="210" r="9" fill="#315d4d" />
          <text x="84" y="214" className="map-pin-label">{handoverCase.startPoint.short}</text>
        </g>
        {campusLocations.filter((place) => place.available).map((place) => (
          <g key={place.id} transform={`translate(${place.x * 6.4 - 8}, ${place.y * 3.6 - 8})`}>
            <circle r="7" cx="8" cy="8" className={`map-dot ${place.safety} ${destinationId === place.id ? "active" : ""}`} />
          </g>
        ))}
        {campusAvoidZones.map((zone) => (
          <g key={zone.id} transform={`translate(${zone.x * 6.4 - 8}, ${zone.y * 3.6 - 8})`}>
            <circle r="6" cx="8" cy="8" className="map-dot avoid" />
          </g>
        ))}
      </svg>
      <div className="map-legend">
        <span><i className="dot safe" /> Safe / monitored</span>
        <span><i className="dot moderate" /> Moderate activity</span>
        <span><i className="dot avoid" /> Restricted / avoid</span>
      </div>
    </div>
  );
}
