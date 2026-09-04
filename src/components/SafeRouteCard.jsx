import Icon from "./Icon";
import SafetyBadge from "./SafetyBadge";

export default function SafeRouteCard({ location, selected, onChoose }) {
  const closed = !location.available;
  return (
    <article className={`safe-route-card ${selected ? "selected" : ""} ${closed ? "unavailable" : ""}`}>
      <div className="safe-route-card-top">
        <div>
          {location.recommended && <span className="eyebrow">Recommended handover point</span>}
          <h3>{location.name}</h3>
          <p>{location.distance} away · {location.walk}</p>
        </div>
        <SafetyBadge tone={closed ? "avoid" : location.safety}>
          {closed ? "Unavailable" : location.safetyLabel}
        </SafetyBadge>
      </div>
      <ul className="safety-checks">
        {location.tags.map((tag) => (
          <li key={tag}><span>{closed ? "–" : "✓"}</span> {tag}</li>
        ))}
      </ul>
      <p className="muted card-note">{location.note}</p>
      {closed ? (
        <button type="button" className="button button-outline full" onClick={() => onChoose(location)}>See why it’s unavailable</button>
      ) : (
        <button type="button" className="button button-primary full" onClick={() => onChoose(location)}>
          {selected ? "Selected" : "Choose this location"} <Icon name="check" size={16} />
        </button>
      )}
    </article>
  );
}
