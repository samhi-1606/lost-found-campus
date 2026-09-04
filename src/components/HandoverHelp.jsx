import { useState } from "react";
import Icon from "./Icon";

export default function HandoverHelp({ onChangeLocation, onCancel }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("menu");

  const close = () => {
    setOpen(false);
    setView("menu");
  };

  return (
    <>
      <aside className="panel help-card">
        <div className="help-card-icon"><Icon name="help" size={18} /></div>
        <strong>Need help?</strong>
        <p>Not sure where to meet, or something feels off? CampusFind can point you to a safer option.</p>
        <button type="button" className="button button-outline full" onClick={() => setOpen(true)}>Get a little help</button>
      </aside>

      {open && (
        <div className="modal-overlay" onClick={close} role="presentation">
          <div className="modal-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-labelledby="help-title">
            {view === "menu" && (
              <>
                <h2 id="help-title">Need a hand?</h2>
                <p>Choose whatever feels most useful. Nothing here places a real call.</p>
                <button type="button" className="help-option" onClick={() => setView("security")}>
                  <Icon name="shield" size={18} />
                  <span><strong>Campus Security</strong><small>Find the staffed desk and opening hours.</small></span>
                </button>
                <button type="button" className="help-option" onClick={() => { close(); onChangeLocation(); }}>
                  <Icon name="pin" size={18} />
                  <span><strong>Change handover location</strong><small>Pick another monitored campus spot.</small></span>
                </button>
                <button type="button" className="help-option danger" onClick={() => { close(); onCancel(); }}>
                  <Icon name="alert" size={18} />
                  <span><strong>Cancel handover</strong><small>Pause the meet-up if plans have changed.</small></span>
                </button>
                <button type="button" className="button button-outline full" onClick={close}>Close</button>
              </>
            )}
            {view === "security" && (
              <>
                <h2 id="help-title">Campus Security</h2>
                <p>The Main Campus Security Desk is staffed during campus hours. Mention CampusFind if you need a quiet place to wait.</p>
                <div className="process-note"><Icon name="phone" size={16} /><p>In a real rollout this would connect you to campus security. This preview stays on-screen only.</p></div>
                <div className="button-row">
                  <button type="button" className="button button-outline" onClick={() => setView("menu")}>Back</button>
                  <button type="button" className="button button-primary" onClick={close}>Got it</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
