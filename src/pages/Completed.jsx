import { Link } from "react-router-dom";
import Icon from "../components/Icon";

export default function Completed() {
  return (
    <div className="center-state completion">
      <div className="success-circle">✓</div>
      <span className="eyebrow">CASE COMPLETED</span>
      <h1>Back where it belongs.</h1>
      <p>The backpack is with its owner again. Thanks for taking the extra minute to meet somewhere public and confirm the handover in person.</p>
      <div className="feedback">
        <strong>How did the meet-up feel?</strong>
        <div>
          <button type="button">😊 Smooth</button>
          <button type="button">😐 Okay</button>
          <button type="button">😕 A bit awkward</button>
        </div>
      </div>
      <div className="button-row">
        <Link to="/dashboard" className="button button-primary">Return to dashboard</Link>
        <Link to="/my-reports" className="button button-outline">View my reports</Link>
      </div>
      <div className="tiny-note"><Icon name="heart" size={15} /> Small notes like this help the next student feel safer.</div>
    </div>
  );
}
