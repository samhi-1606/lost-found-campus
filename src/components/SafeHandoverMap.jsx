import CampusMap from "./CampusMap";
import Icon from "./Icon";
import { routeOptions } from "../data/mockData";

export default function SafeHandoverMap({
  location,
  routeId,
  onRouteChange,
  onBack,
  onChangeLocation,
  onContinue,
  routeUnavailable = false,
  onRetryRoute,
}) {
  const route = routeOptions[routeId] || routeOptions.safest;
  const meters = Math.max(120, location.meters + route.extraMeters);
  const minutes = Math.max(3, location.minutes + route.extraMinutes);

  if (routeUnavailable) {
    return (
      <section className="panel route-unavailable">
        <div className="empty-soft">
          <div>🗺️</div>
          <strong>We couldn’t sketch a route just now.</strong>
          <p>This is a campus map prototype. Try another path, or pick a different meeting spot.</p>
          <div className="button-row" style={{ justifyContent: "center", marginTop: 16 }}>
            <button type="button" className="button button-outline" onClick={onChangeLocation}>Change location</button>
            <button type="button" className="button button-primary" onClick={onRetryRoute}>Try again</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="safe-route-layout">
      <section className="panel">
        <button type="button" className="back-link" onClick={onBack}>← Back to locations</button>
        <span className="eyebrow">HERE’S A SAFER WAY TO GET THERE</span>
        <h2>Route to {location.name}</h2>
        <p className="muted">We’ll keep you on busier, better-watched parts of campus whenever we can.</p>
        <CampusMap destinationId={location.id} routeId={routeId} />
        <div className="route-choice-row">
          {Object.values(routeOptions).map((option) => (
            <button
              type="button"
              key={option.id}
              className={`route-choice ${routeId === option.id ? "active" : ""}`}
              onClick={() => onRouteChange(option.id)}
            >
              <strong>{option.name}</strong>
              <span>{option.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <aside className="panel route-summary">
        <span className="eyebrow">WALKING SUMMARY</span>
        <h3>{location.short}</h3>
        <div className="route-facts">
          <div><Icon name="pin" size={16} /><strong>{meters} m</strong><span>Distance</span></div>
          <div><Icon name="walk" size={16} /><strong>~{minutes} min</strong><span>On foot</span></div>
          <div><Icon name="shield" size={16} /><strong>{route.safetyRating}</strong><span>Safety rating</span></div>
        </div>
        <p className="muted">Destination: {location.name}</p>
        <div className="monitored-list">
          <strong>Monitored along the way</strong>
          {route.monitored.map((spot) => <span key={spot}>✓ {spot}</span>)}
        </div>
        <div className="button-row">
          <button type="button" className="button button-outline" onClick={onChangeLocation}>Change location</button>
          <button type="button" className="button button-primary" onClick={onContinue}>
            I’m on my way <Icon name="arrow" size={16} />
          </button>
        </div>
      </aside>
    </div>
  );
}
