import { useEffect, useRef } from "react";
import Icon from "./Icon";

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export default function HandoverCode({
  displayCode,
  secondsLeft,
  expired,
  digits,
  onDigitChange,
  onVerify,
  onCopy,
  onResend,
  verifying,
  status,
}) {
  const inputs = useRef([]);

  useEffect(() => {
    if (status === "success") return;
    inputs.current[0]?.focus();
  }, [status, displayCode]);

  const handleChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    onDigitChange(index, digit);
    if (digit && index < 5) inputs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, event) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("");
    pasted.forEach((digit, index) => onDigitChange(index, digit));
    inputs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const grouped = `${displayCode.slice(0, 3)} ${displayCode.slice(3)}`;

  return (
    <div className="handover-code">
      <section className="panel code-share">
        <span className="eyebrow">One-time handover code</span>
        <h2>If you’re returning the item</h2>
        <p>Share this code only when you are at the agreed handover location.</p>
        <div className={`code-face ${expired ? "expired" : ""}`}>{expired ? "------" : grouped}</div>
        <div className="code-meta">
          <span><Icon name="clock" size={15} /> {expired ? "This code has expired" : `Expires in ${formatTime(secondsLeft)}`}</span>
          <button type="button" className="text-action" onClick={onCopy} disabled={expired}>
            <Icon name="copy" size={14} /> Copy code
          </button>
        </div>
        <button type="button" className="button button-outline full" onClick={onResend}>
          <Icon name="refresh" size={16} /> Generate a new code
        </button>
        <div className="code-warning">
          <Icon name="lock" size={17} />
          Never share your verification code before meeting at the selected location.
        </div>
      </section>

      <section className="panel code-enter">
        <span className="eyebrow">Confirm the handover</span>
        <h2>If you’re receiving the item</h2>
        <p>Enter the six digits they show you. This only confirms you’re both here — ownership was already checked.</p>
        <div className="digit-row" onPaste={handlePaste}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(node) => { inputs.current[index] = node; }}
              className={`digit-box ${status === "incorrect" ? "error" : ""}`}
              inputMode="numeric"
              maxLength={1}
              aria-label={`Digit ${index + 1} of 6`}
              value={digit}
              disabled={verifying || status === "success" || expired}
              onChange={(event) => handleChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
            />
          ))}
        </div>
        {status === "empty" && <p className="field-hint">Add all six digits so we know you’re both here.</p>}
        {status === "incorrect" && <p className="field-hint error">That code doesn’t match. Please check with the other person and try again.</p>}
        {expired && <p className="field-hint error">This code has run out. Generate a new one and try once more.</p>}
        {status === "resent" && <p className="field-hint">A fresh code is ready. Use the new digits at the meet-up.</p>}
        <button type="button" className="button button-primary full" onClick={onVerify} disabled={verifying || expired || status === "success"}>
          {verifying ? "Checking…" : "Verify code"}
        </button>
      </section>
    </div>
  );
}
