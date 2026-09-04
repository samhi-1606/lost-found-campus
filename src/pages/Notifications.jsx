import { notifications } from "../data/mockData";
import Icon from "../components/Icon";

export default function Notifications() {
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">STAY IN THE LOOP</span><h1>Notifications</h1><p>Useful updates, without the noise.</p></div><button className="button button-outline">Mark all read</button></div>
      <section className="panel notification-list">{notifications.map(n => <div className={`notification ${n.unread ? "unread" : ""}`} key={n.id}><div className="notification-icon"><Icon name="bell" size={18} /></div><div><strong>{n.title}</strong><p>{n.text}</p><small>{n.time}</small></div>{n.unread && <span className="unread-dot" />}</div>)}</section>
    </>
  );
}