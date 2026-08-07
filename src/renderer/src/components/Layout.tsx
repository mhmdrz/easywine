import { NavLink, Outlet } from "react-router-dom";
import Icon from "./Icon";
import "./Layout.scss";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** `end` makes the index route only match exactly "/". */
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Configurations", icon: "folder", end: true },
  { to: "/downloads", label: "Downloads", icon: "download" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

function Layout(): React.JSX.Element {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="text-2xl" aria-hidden="true">
            🍷
          </span>
          <span>EasyWine</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="nav-link"
            >
              <Icon name={item.icon} className="text-xl" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
