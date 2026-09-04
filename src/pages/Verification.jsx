import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";

const questions = [
  "What small mark or sticker is on the item?",
  "What is unusual about the condition of the item?",
  "Is there any personal text, engraving or identifier you added?",
];

export default function Verification() {
  const [step, setStep] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const navigate = useNavigate();

  const next = (event) => {
    event.preventDefault();
    if (step < questions.length - 1) setStep(step + 1);
    else setAccepted(true);
  };

  if (accepted) {
    return (
      <div className="center-state">
        <div className="success-circle">✓</div>
        <span className="eyebrow">MATCH ACCEPTED</span>
        <h1>That lines up. You’re the owner.</h1>
        <p>Private details checked out. Next, pick a monitored campus location and meet in person — the handover code comes last, when you’re both there.</p>
        <div className="privacy-note" style={{ textAlign: "left", maxWidth: 480 }}>
          <Icon name="lock" size={18} />
          <div>
            <strong>Your contact details stay private until the handover process is completed.</strong>
            <p>You’ll still look like a Verified Campus Member to the other person.</p>
          </div>
        </div>
        <div className="button-row" style={{ marginTop: 22 }}>
          <button className="button button-primary" onClick={() => navigate("/handover")}>
            Choose a safe handover location <Icon name="arrow" size={17} />
          </button>
          <Link to="/matches" className="button button-outline">Not this item</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-heading narrow">
        <div>
          <span className="eyebrow">OWNERSHIP VERIFICATION</span>
          <h1>A few things only the owner should know.</h1>
          <p>This is the ownership check — not the handover code. Answers stay private and are never shown to the other person.</p>
        </div>
      </div>
      <div className="verification-layout">
        <section className="panel verification-card">
          <div className="progress-line"><span style={{ width: `${((step + 1) / questions.length) * 100}%` }} /></div>
          <div className="question-count">Question {step + 1} of {questions.length}</div>
          <h2>{questions[step]}</h2>
          <p className="muted">Be as specific as you can. If you don’t remember, it’s okay to say so.</p>
          <form onSubmit={next}>
            <textarea key={step} required rows="7" placeholder="Your answer stays between you and CampusFind…" autoFocus />
            <div className="button-row">
              <Link to="/matches" className="button button-outline">Cancel</Link>
              <button className="button button-primary" type="submit">
                {step === questions.length - 1 ? "Finish ownership check" : "Next question"} <Icon name="arrow" size={17} />
              </button>
            </div>
          </form>
        </section>
        <aside className="verification-aside">
          <div className="lock-illustration">🔐</div>
          <h3>Why these questions?</h3>
          <p>A high match score is a clue, not proof. These private details help us feel confident before anyone meets up.</p>
          <p className="muted" style={{ marginTop: 16 }}>The one-time handover code comes later — only when you’re standing at the agreed campus location.</p>
        </aside>
      </div>
    </>
  );
}
