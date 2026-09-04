import Icon from "../components/Icon";
import { Link } from "react-router-dom";

export default function Settings() {
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">PREFERENCES</span><h1>Settings</h1><p>Control how CampusFind communicates and protects your information.</p></div></div>
      <div className="settings-list">
        <section className="panel setting-section"><div className="setting-title"><Icon name="bell" /><div><h2>Notifications</h2><p>Choose what you want to hear about.</p></div></div><Setting label="Potential matches" text="Tell me when a promising match appears." checked /><Setting label="Handover reminders" text="Remind me about upcoming handovers." checked /><Setting label="Community updates" text="Occasional product and campus updates." /></section>
        <section className="panel setting-section"><div className="setting-title"><Icon name="lock" /><div><h2>Privacy & safety</h2><p>CampusFind keeps private identifiers out of public views.</p></div></div><Setting label="Hide sensitive item details" text="Keep detailed identifiers reserved for verification." checked /><Setting label="Prefer staffed handover points" text="Suggest security desks and other approved places first." checked /></section>
        <section className="panel setting-section"><div className="setting-title"><Icon name="user" /><div><h2>Account</h2><p>Manage your account access.</p></div></div><Link to="/profile" className="setting-link">Edit profile <span>→</span></Link><button className="setting-link danger">Log out <span>→</span></button></section>
      </div>
    </>
  );
}
function Setting({ label, text, checked }) { return <label className="setting-row"><span><strong>{label}</strong><small>{text}</small></span><input type="checkbox" defaultChecked={checked} /></label>; }