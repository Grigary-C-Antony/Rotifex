import { useState } from "react";
import { isAuthenticated, getUser, clearTokens } from "./auth";
import { api } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Models from "./pages/Models";
import Users from "./pages/Users";
import Files from "./pages/Files";
import Logs from "./pages/Logs";
import Settings from "./pages/Settings";
import AI from "./pages/AI";

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: "◆" },
  { key: "models", label: "Database Schemas", icon: "▤" },
  { key: "users", label: "User Management", icon: "◉" },
  { key: "files", label: "File Browser", icon: "◫" },
  { key: "ai", label: "AI Integration", icon: "✦" },
  { key: "logs", label: "Server Logs", icon: "▣" },
  { key: "settings", label: "Settings", icon: "⚙" },
];

const PAGE_TITLES = {
  dashboard: "Dashboard",
  models: "Database Schemas",
  users: "User Management",
  files: "File Browser",
  ai: "AI Integration",
  logs: "Server Logs",
  settings: "Settings",
};

function roleCls(role) {
  if (role === "admin") return "role-admin";
  if (role === "moderator") return "role-mod";
  return "role-user";
}

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated);
  const [user, setUser] = useState(getUser);
  const [page, setPage] = useState("dashboard");

  const handleLogin = (u) => {
    setUser(u);
    setAuthed(true);
  };

  const handleLogout = async () => {
    try { await api.logout(); } catch { /* best-effort — always clear local state */ }
    clearTokens();
    setAuthed(false);
    setUser(null);
    setPage("dashboard");
  };

  if (!authed) return <Login onLogin={handleLogin} />;

  const renderPage = () => {
    switch (page) {
      case "dashboard":
        return <Dashboard />;
      case "models":
        return <Models />;
      case "users":
        return <Users />;
      case "files":
        return <Files />;
      case "ai":
        return <AI />;
      case "logs":
        return <Logs />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  const initials = user
    ? (user.display_name || user.email || "?").slice(0, 2).toUpperCase()
    : "??";

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img
            src="/Logo.png"
            alt="Rotifex"
            style={{ height: 28, width: "auto" }}
          />
        </div>

        <nav className="sidebar-nav">
          {NAV.map((n) => (
            <a
              key={n.key}
              href="#"
              className={page === n.key ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                setPage(n.key);
              }}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </a>
          ))}
        </nav>

        {/* ── Logged-in user ─────────────────────────────────────────── */}
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">
              {user?.display_name || user?.email || "Admin"}
            </div>
            {/* {user?.role && (
              <span
                className={`role-badge ${roleCls(user.role)}`}
                style={{ fontSize: 10, padding: "1px 6px" }}
              >
                {user.role}
              </span>
            )} */}
          </div>
          <button
            className="btn btn-ghost btn-sm sidebar-logout"
            title="Sign out"
            onClick={handleLogout}
          >
            ⏻
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="header">{PAGE_TITLES[page]}</header>
        <div className="content">{renderPage()}</div>
      </div>
    </div>
  );
}
