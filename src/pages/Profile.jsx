import { Link } from "react-router-dom";
import Icon from "../components/Icon";

export default function Profile() {
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">ACCOUNT</span><h1>Your profile</h1><p>Basic account details and your CampusFind activity.</p></div><Link to="/settings" className="button button-outline"><Icon name="settings" size={17} /> Settings</Link></div>
      <div className="profile-layout"><section className="panel profile-card"><div className="profile-avatar">AM</div><h2>Alex Morgan</h2><p>Computer Science · Year 3</p><span className="profile-email">Verified Campus Member</span><div className="profile-stats"><div><strong>6</strong><span>Total reports</span></div><div><strong>4</strong><span>Resolved</span></div><div><strong>12</strong><span>Helpful actions</span></div></div></section><section className="panel"><span className="eyebrow">PERSONAL DETAILS</span><h2>Kept quietly on CampusFind</h2><div className="detail-rows"><div><span>Full name</span><strong>Visible to you</strong></div><div><span>College email</span><strong>Verified campus email</strong></div><div><span>Student ID</span><strong>On file · not shown in matches</strong></div><div><span>Member since</span><strong>August 2026</strong></div></div><div className="privacy-note"><Icon name="lock" size={18} /><div><strong>Your contact details stay private until the handover process is completed.</strong><p>Other students see a verified campus member, not a phone number or personal inbox.</p></div></div></section></div>
    </>
  );
}