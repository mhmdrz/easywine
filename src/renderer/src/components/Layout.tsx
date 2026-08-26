import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { CXWINE_VERSION_ID } from "@shared/wine";
import Icon from "./Icon";
import "./Layout.scss";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/game-exclusive", label: "Game exclusive", icon: "sports_esports" },
  { to: "/", label: "Instances", icon: "folder", end: true },
  { to: "/downloads", label: "Downloads", icon: "download" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

const GITHUB_URL = "https://github.com/mhmdrz/easywine";

function useActiveNav(): string {
  const { pathname } = useLocation();
  const [instanceParent, setInstanceParent] = useState<string | null>(null);

  const instanceMatch = pathname.match(/^\/instance\/([^/]+)/);
  const instanceName = instanceMatch
    ? decodeURIComponent(instanceMatch[1])
    : null;

  useEffect(() => {
    if (!instanceName) {
      setInstanceParent(null);
      return;
    }
    let cancelled = false;
    window.easywine.config.get(instanceName).then((config) => {
      if (cancelled) return;
      setInstanceParent(
        config?.wineVersion === CXWINE_VERSION_ID ? "/game-exclusive" : "/",
      );
    });
    return () => {
      cancelled = true;
    };
  }, [instanceName]);

  if (instanceName) return instanceParent ?? "";
  if (pathname.startsWith("/game-exclusive")) return "/game-exclusive";
  if (pathname.startsWith("/downloads")) return "/downloads";
  if (pathname.startsWith("/settings")) return "/settings";
  return "/";
}

function Layout(): React.JSX.Element {
  const [version, setVersion] = useState("");
  const activeTo = useActiveNav();

  useEffect(() => {
    window.easywine.app.version().then(setVersion);
  }, []);

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
              className={item.to === activeTo ? "nav-link active" : "nav-link"}
            >
              <Icon name={item.icon} className="text-xl" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <span className="sidebar__version">
            {version ? `v${version}` : ""}
          </span>
          <button
            type="button"
            className="sidebar__github"
            title="View on GitHub"
            aria-label="View on GitHub"
            onClick={() => window.easywine.app.openExternal(GITHUB_URL)}
          >
            <Icon name="code" className="text-lg" />
            GitHub
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
