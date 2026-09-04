import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import Logo from "./Logo";
import Icon from "./Icon";

const nav = [
  ["dashboard", "home", "Dashboard"],
  ["report-lost", "search", "Report lost"],
  ["report-found", "plus", "Report found"],
  ["my-reports", "file", "My reports"],
  ["matches", "heart", "Matches"],
];

export function AppShell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-top">
          <Logo />
          <button className="icon-button mobile-close" onClick={() => setOpen(false)}><Icon name="close" /></button>
        </div>

        <nav className="side-nav">
          <p className="nav-label">Workspace</p>
          {nav.map(([to, icon, label]) => (
            <NavLink key={to} to={`/${to}`} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <Icon name={icon} size={19} />
              <span>{label}</span>
            </NavLink>
          ))}

          <p className="nav-label second">Account</p>
          <NavLink to="/notifications" onClick={() => setOpen(false)} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            <Icon name="bell" size={19} /><span>Notifications</span><span className="nav-count">2</span>
          </NavLink>
          <NavLink to="/profile" onClick={() => setOpen(false)} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            <Icon name="user" size={19} /><span>Profile</span>
          </NavLink>
          <NavLink to="/settings" onClick={() => setOpen(false)} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            <Icon name="settings" size={19} /><span>Settings</span>
          </NavLink>
        </nav>

        <div className="sidebar-help">
          <div className="help-icon">?</div>
          <strong>Need a hand?</strong>
          <p>Choose a monitored campus location. Not sure where to meet?</p>
          <button onClick={() => navigate("/handover")}>Need help?</button>
        </div>

        <div className="sidebar-user">
          <div className="avatar">AM</div>
          <div><strong>Alex Morgan</strong><span>Student</span></div>
          <Icon name="chevron" size={16} />
        </div>
      </aside>

      <div className="mobile-topbar">
        <button className="icon-button" onClick={() => setOpen(true)}><Icon name="menu" /></button>
        <Logo />
        <button className="icon-button" onClick={() => navigate("/notifications")}><Icon name="bell" /></button>
      </div>

      {open && <button className="sidebar-overlay" onClick={() => setOpen(false)} aria-label="Close menu" />}

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">CampusFind <span>/</span> Student workspace</div>
          <div className="top-actions">
            <button className="icon-button" onClick={() => navigate("/notifications")}><Icon name="bell" /></button>
            <button className="profile-pill" onClick={() => navigate("/profile")}><span className="avatar small">AM</span><span>Alex</span></button>
          </div>
        </header>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  );
}