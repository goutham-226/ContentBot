import { useState } from 'react';
import type { MouseEvent } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import './DashboardPage.css';
import type { Bot, BotsContext } from './bots';
import {
  HelpIcon, InfoIcon, LogoutIcon, MenuIcon, RobotIcon, SidebarIcon, TagIcon,
} from '../../components/icons';

const MOBILE_QUERY = '(max-width: 768px)';

// Set by LoginPage when it redirects here.
function loggedInAs(state: unknown): string {
  return state && typeof state === 'object' && 'user' in state && typeof state.user === 'string'
    ? state.user
    : '';
}

export default function DashboardPage() {
  const location = useLocation();
  // Read once: location.state is per history entry, so it's gone after the first click.
  const [user] = useState(() => loggedInAs(location.state));
  // TODO: load and save bots through the API once sessions exist.
  const [bots, setBots] = useState<Bot[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const onNewBotScreen = location.pathname.replace(/\/$/, '') === '/app';

  function addBot(niche: string): Bot {
    const clean = niche.trim();
    const bot: Bot = {
      id: crypto.randomUUID(),
      name: `${clean.charAt(0).toUpperCase()}${clean.slice(1)} Bot`,
      niche: clean,
      createdAt: Date.now(),
    };
    setBots((prev) => [bot, ...prev]);
    return bot;
  }

  // Like ChatGPT's "New chat": already on a fresh new-bot screen means nothing changes,
  // so a half-typed niche isn't wiped.
  function handleNewBot(e: MouseEvent<HTMLAnchorElement>) {
    setDrawerOpen(false);
    if (onNewBotScreen) e.preventDefault();
  }

  function handleToggle() {
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setDrawerOpen(false);
    } else {
      setCollapsed((c) => !c);
    }
  }

  const closeDrawer = () => setDrawerOpen(false);
  const context: BotsContext = { bots, addBot };

  return (
    <div className={`dash ${collapsed ? 'dash--collapsed' : ''}`}>
      {drawerOpen && <div className="dock-backdrop" onClick={closeDrawer} aria-hidden="true" />}

      <aside className={`dock ${drawerOpen ? 'dock--open' : ''}`} aria-label="Sidebar">
        <div className="dock-top">
          <Link to="/app" className="dock-brand" onClick={handleNewBot}>
            <img src="/logo.svg" alt="" />
            <span className="dock-label">Twinfluencer</span>
          </Link>
          <button
            type="button"
            className="dock-icon-btn"
            onClick={handleToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <SidebarIcon />
          </button>
        </div>

        <Link
          to="/app"
          className={`dock-item dock-new ${onNewBotScreen ? 'is-active' : ''}`}
          onClick={handleNewBot}
          title={collapsed ? 'New bot' : undefined}
        >
          <RobotIcon />
          <span className="dock-label">New bot</span>
        </Link>

        <section className="dock-bots-section" aria-labelledby="bots-heading">
          <h2 id="bots-heading" className="dock-heading dock-label">Bots</h2>
          {bots.length === 0 ? (
            <p className="dock-empty dock-label">Your bots will appear here.</p>
          ) : (
            <ul className="dock-bots">
              {bots.map((bot) => (
                <li key={bot.id}>
                  <NavLink
                    to={`/app/bots/${bot.id}`}
                    className={({ isActive }) => `dock-item ${isActive ? 'is-active' : ''}`}
                    onClick={closeDrawer}
                    title={bot.name}
                  >
                    <span className="dock-avatar" aria-hidden="true">{bot.name.charAt(0)}</span>
                    <span className="dock-label dock-bot-name">{bot.name}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </section>

        <nav className="dock-links" aria-label="Info">
          <Link to="/about" className="dock-item" title={collapsed ? 'About' : undefined}>
            <InfoIcon />
            <span className="dock-label">About</span>
          </Link>
          <Link to="/pricing" className="dock-item" title={collapsed ? 'Pricing' : undefined}>
            <TagIcon />
            <span className="dock-label">Pricing</span>
          </Link>
          <Link to="/help" className="dock-item" title={collapsed ? 'Help' : undefined}>
            <HelpIcon />
            <span className="dock-label">Help</span>
          </Link>
        </nav>

        <div className="dock-profile">
          <span className="dock-avatar dock-avatar--user" aria-hidden="true">
            {(user || '?').charAt(0).toUpperCase()}
          </span>
          <span className="dock-label dock-user">
            <span className="dock-user-name">{user || 'Guest'}</span>
            <span className="dock-user-plan">Free plan</span>
          </span>
          <Link to="/" className="dock-icon-btn dock-logout" aria-label="Log out" title="Log out">
            <LogoutIcon />
          </Link>
        </div>
      </aside>

      <div className="dash-main">
        <header className="mobile-bar">
          <button type="button" className="dock-icon-btn" onClick={() => setDrawerOpen(true)} aria-label="Open sidebar">
            <MenuIcon />
          </button>
          <span className="mobile-title">Twinfluencer</span>
          <Link to="/app" className="dock-icon-btn" onClick={handleNewBot} aria-label="New bot">
            <RobotIcon />
          </Link>
        </header>

        <main className="canvas">
          <Outlet context={context} />
        </main>
      </div>
    </div>
  );
}
