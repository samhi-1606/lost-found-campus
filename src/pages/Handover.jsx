import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import HandoverStatus from "../components/HandoverStatus";
import SafeRouteCard from "../components/SafeRouteCard";
import CampusMap from "../components/CampusMap";
import SafeHandoverMap from "../components/SafeHandoverMap";
import HandoverCode from "../components/HandoverCode";
import HandoverHelp from "../components/HandoverHelp";
import SafetyBadge from "../components/SafetyBadge";
import { campusLocations, handoverCase } from "../data/mockData";

const MOCK_CODES = ["482716", "391847", "605294"];
const CODE_TTL = 8 * 60;

export default function Handover() {
  const navigate = useNavigate();
  const [stage, setStage] = useState("pick");
  const [selectedId, setSelectedId] = useState("security");
  const [justChose, setJustChose] = useState(false);
  const [unavailableNotice, setUnavailableNotice] = useState(false);
  const [routeId, setRouteId] = useState("safest");
  const [routeUnavailable, setRouteUnavailable] = useState(false);
  const [codeIndex, setCodeIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(CODE_TTL);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [codeStatus, setCodeStatus] = useState("");
  const [copied, setCopied] = useState(false);

  const location = campusLocations.find((place) => place.id === selectedId) || campusLocations[0];
  const code = MOCK_CODES[codeIndex];
  const expired = secondsLeft <= 0;

  useEffect(() => {
    if (stage !== "meet" || expired) return undefined;
    const timer = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [stage, expired, codeIndex]);

  const chooseLocation = (place) => {
    if (!place.available) {
      setUnavailableNotice(true);
      setJustChose(false);
      return;
    }
    setUnavailableNotice(false);
    setSelectedId(place.id);
    setJustChose(true);
  };

  const updateDigit = (index, value) => {
    setDigits((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    if (codeStatus === "incorrect" || codeStatus === "empty" || codeStatus === "resent") setCodeStatus("");
  };

  const verify = () => {
    const entered = digits.join("");
    if (entered.length < 6) {
      setCodeStatus("empty");
      return;
    }
    if (expired) {
      setCodeStatus("expired");
      return;
    }
    setVerifying(true);
    setCodeStatus("");
    window.setTimeout(() => {
      setVerifying(false);
      if (entered === code) setStage("success");
      else setCodeStatus("incorrect");
    }, 900);
  };

  const resend = () => {
    setCodeIndex((index) => (index + 1) % MOCK_CODES.length);
    setSecondsLeft(CODE_TTL);
    setDigits(["", "", "", "", "", ""]);
    setCodeStatus("resent");
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* demo fallback */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (stage === "cancelled") {
    return (
      <div className="center-state">
        <div className="success-circle muted-circle">–</div>
        <span className="eyebrow">HANDOVER PAUSED</span>
        <h1>No rush. We can pick this up later.</h1>
        <p>The meet-up is cancelled for now. Your case stays open, and you can choose a new safe location whenever you’re ready.</p>
        <div className="button-row">
          <button className="button button-primary" onClick={() => { setStage("pick"); setJustChose(false); }}>Choose a new location</button>
          <button className="button button-outline" onClick={() => navigate("/matches")}>Back to matches</button>
        </div>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div className="center-state handover-success">
        <div className="success-circle pop">✓</div>
        <span className="eyebrow">✓ HANDOVER VERIFIED</span>
        <h1>You’re all set.</h1>
        <p>The item has been safely handed over. Your handover is verified — thanks for meeting in a public, monitored spot.</p>
        <button className="button button-primary" onClick={() => navigate("/completed")}>Complete case <Icon name="arrow" size={17} /></button>
      </div>
    );
  }

  return (
    <>
      <div className="page-heading narrow">
        <div>
          <span className="eyebrow">SECURE HANDOVER</span>
          <h1>{stage === "pick" ? "Choose a monitored campus location." : stage === "route" ? "Here’s a safer way to get there." : "Ready for handover."}</h1>
          <p>
            {stage === "pick" && "Meet somewhere public, staffed, and easy to find. Distance is less important than feeling comfortable."}
            {stage === "route" && "Stay on well-used campus paths. You can still change your mind about the meeting point."}
            {stage === "meet" && "Ownership is already verified. This last step only confirms you’re both at the same place."}
          </p>
        </div>
      </div>

      <HandoverStatus current={stage === "success" ? "done" : stage} />

      {stage === "pick" && (
        <>
          {unavailableNotice && (
            <div className="notice-banner">
              <Icon name="alert" size={18} />
              <div>
                <strong>Something changed</strong>
                <p>The selected handover location is no longer available. Choose another safe location.</p>
              </div>
            </div>
          )}
          {justChose && !unavailableNotice && (
            <div className="notice-banner success">
              <Icon name="check" size={18} />
              <div>
                <strong>Great — this is a safe place to meet.</strong>
                <p>We’ll sketch a calmer walking route next.</p>
              </div>
            </div>
          )}

          <div className="handover-pick-grid">
            <div>
              <CampusMap destinationId={justChose ? selectedId : undefined} routeId="safest" />
              <p className="tiny-note map-hint"><Icon name="pin" size={15} /> Green spots are staffed or camera-covered. Red marks quieter corners to skip.</p>
            </div>
            <div className="location-stack">
              {campusLocations.map((place) => (
                <SafeRouteCard
                  key={place.id}
                  location={place}
                  selected={selectedId === place.id && justChose}
                  onChoose={chooseLocation}
                />
              ))}
            </div>
          </div>

          <div className="handover-footer-actions">
            <HandoverHelp onChangeLocation={() => { setJustChose(false); setUnavailableNotice(false); }} onCancel={() => setStage("cancelled")} />
            <button
              type="button"
              className="button button-primary"
              disabled={!justChose}
              onClick={() => { setStage("route"); setRouteId("safest"); setRouteUnavailable(false); }}
            >
              Continue to Safe Route <Icon name="arrow" size={17} />
            </button>
          </div>
        </>
      )}

      {stage === "route" && (
        <>
          <SafeHandoverMap
            location={location}
            routeId={routeId}
            onRouteChange={setRouteId}
            onBack={() => setStage("pick")}
            onChangeLocation={() => { setStage("pick"); setJustChose(true); }}
            onContinue={() => setStage("meet")}
            routeUnavailable={routeUnavailable}
            onRetryRoute={() => setRouteUnavailable(false)}
          />
          <div className="handover-footer-actions">
            <HandoverHelp onChangeLocation={() => setStage("pick")} onCancel={() => setStage("cancelled")} />
            <button type="button" className="text-action" onClick={() => setRouteUnavailable(true)}>Can’t see a route?</button>
          </div>
        </>
      )}

      {stage === "meet" && (
        <div className="meet-layout">
          <div>
            <section className="panel meet-summary">
              <div className="meet-item">
                <div className="report-icon">{handoverCase.item.icon}</div>
                <div>
                  <span className="eyebrow">ITEM</span>
                  <h2>{handoverCase.item.name}</h2>
                  <p className="muted">{handoverCase.item.category} · Case {handoverCase.item.id}</p>
                </div>
              </div>
              <div className="people-row">
                <article>
                  <SafetyBadge tone="safe">Verified Campus Member</SafetyBadge>
                  <strong>{handoverCase.owner.label}</strong>
                  <p>{handoverCase.owner.roleNote}</p>
                </article>
                <article>
                  <SafetyBadge tone="safe">Verified Campus Member</SafetyBadge>
                  <strong>{handoverCase.finder.label}</strong>
                  <p>{handoverCase.finder.roleNote}</p>
                </article>
              </div>
              <div className="privacy-note">
                <Icon name="lock" size={18} />
                <div>
                  <strong>Your contact details stay private until the handover process is completed.</strong>
                  <p>Talk through CampusFind for now — no phone numbers or personal emails are shown here.</p>
                </div>
              </div>
              <div className="handover-location">
                <Icon name="map" size={20} />
                <div>
                  <span>Selected handover location</span>
                  <strong>{location.name}</strong>
                  <small>{location.tags.slice(0, 3).join(" · ")}</small>
                </div>
                <button type="button" className="button button-outline" onClick={() => setStage("pick")}>Change</button>
              </div>
              <div className="meet-flags">
                <div><Icon name="shield" size={16} /><span>Public, monitored meeting point</span></div>
                <div><Icon name="walk" size={16} /><span>Route status: {routeId === "safest" ? "Safest path selected" : routeId === "accessible" ? "Accessible path selected" : "Faster path selected"}</span></div>
                <div className="ready-pill">Ready for handover</div>
              </div>
              {copied && <p className="field-hint">Code copied. Share it only in person.</p>}
            </section>
            <HandoverHelp onChangeLocation={() => setStage("pick")} onCancel={() => setStage("cancelled")} />
          </div>
          <HandoverCode
            displayCode={code}
            secondsLeft={secondsLeft}
            expired={expired}
            digits={digits}
            onDigitChange={updateDigit}
            onVerify={verify}
            onCopy={copyCode}
            onResend={resend}
            verifying={verifying}
            status={expired ? "expired" : codeStatus}
          />
        </div>
      )}
    </>
  );
}
