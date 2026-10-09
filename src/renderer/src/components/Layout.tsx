import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { CXWINE_VERSION_ID } from "@shared/wine";
import type { WineConfig } from "@shared/wine";
import Icon from "./Icon";
import CreatePrefixModal from "./CreatePrefixModal";
import "../styles/Layout.scss";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const TOOLBAR_NAV: NavItem[] = [
  { to: "/downloads", label: "Cores", icon: "deployed_code" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

const GITHUB_URL = "https://github.com/mhmdrz/easywine";
const SIDEBAR_STORAGE_KEY = "easywine.sidebar.collapsed";

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
  const [prefixes, setPrefixes] = useState<WineConfig[]>([]);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  });
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeTo = useActiveNav();
  const [createOpen, setCreateOpen] = useState(false);

  const activeInstanceMatch = pathname.match(/^\/instance\/([^/]+)/);
  const activeInstance = activeInstanceMatch
    ? decodeURIComponent(activeInstanceMatch[1])
    : null;

  useEffect(() => {
    window.easywine.app.version().then(setVersion);
  }, []);

  const refreshPrefixes = useCallback((): void => {
    window.easywine.config.list().then(setPrefixes);
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.easywine.config.list().then((list) => {
      if (!cancelled) setPrefixes(list);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey && event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  return (
    <div className={`app-layout${collapsed ? " app-layout--collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar__titlebar" />
        <div className="sidebar__section">
          <div className="sidebar__section-title">Prefixes</div>
          <nav className="sidebar__list">
            {prefixes.length === 0 ? (
              <span className="sidebar__empty">No prefixes yet</span>
            ) : (
              prefixes.map((prefix) => {
                const isCxwine = prefix.wineVersion === CXWINE_VERSION_ID;
                return (
                  <NavLink
                    key={prefix.name}
                    to={`/instance/${encodeURIComponent(prefix.name)}`}
                    title={prefix.name}
                    className={
                      prefix.name === activeInstance
                        ? "sidebar__item active"
                        : "sidebar__item"
                    }
                  >
                    <Icon
                      name={
                        prefix.icon ?? (isCxwine ? "sports_esports" : "wine_bar")
                      }
                      className="sidebar__item-icon"
                    />
                    <span className="sidebar__item-label">{prefix.name}</span>
                  </NavLink>
                );
              })
            )}
          </nav>
        </div>
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
            <Icon name="code" className="text-base" />
            GitHub
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="toolbar">
          <div className="toolbar__leading">
            <button
              type="button"
              className="toolbar__toggle"
              onClick={toggleSidebar}
              title={collapsed ? "Show Sidebar (⌃⌘S)" : "Hide Sidebar (⌃⌘S)"}
              aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
            >
              <Icon
                name={collapsed ? "dock_to_right" : "left_panel_close"}
                className="text-xl"
              />
            </button>
            <div className="toolbar__brand">
              <span>EasyWine</span>
            </div>
          </div>
          <div className="toolbar__actions">
            <button
              type="button"
              className="toolbar__action"
              title="New prefix"
              aria-label="New prefix"
              onClick={() => setCreateOpen(true)}
            >
              <Icon name="add" className="text-xl" />
            </button>
            {TOOLBAR_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                aria-label={item.label}
                className={
                  item.to === activeTo
                    ? "toolbar__action active"
                    : "toolbar__action"
                }
              >
                <Icon name={item.icon} className="text-xl" />
              </NavLink>
            ))}
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>

      {createOpen && (
        <CreatePrefixModal
          onClose={() => setCreateOpen(false)}
          onCreated={(config) => {
            refreshPrefixes();
            navigate(`/instance/${encodeURIComponent(config.name)}`);
          }}
        />
      )}
    </div>
  );
}

export default Layout;
