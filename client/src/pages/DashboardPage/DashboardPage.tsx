import { useCallback, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import './DashboardPage.css';
import type { Bot, BotsContext } from './bots';
import { createBot, deleteBot, getMe, listBots, logout, saveCharacter } from '../../api';
import type { NewBotInput, SessionUser } from '../../api';
import BotAvatar from './BotAvatar';
import {
  HelpIcon, InfoIcon, LogoutIcon, MenuIcon, RobotIcon, SidebarIcon, TagIcon,
} from '../../components/icons';

const MOBILE_QUERY = '(max-width: 768px)';

const INFO_LINKS = [
  { to: '/app/about', label: 'About', Icon: InfoIcon },
  { to: '/app/pricing', label: 'Pricing', Icon: TagIcon },
  { to: '/app/help', label: 'Help', Icon: HelpIcon },
];

export default function DashboardPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const onNewBotScreen = location.pathname.replace(/\/$/, '') === '/app';

  // Who's logged in, and their saved bots. No session sends them to the login page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (cancelled) return;
        if (!me) {
          navigate('/', { replace: true });
          return;
        }
        setUser(me);
        const saved = await listBots();
        if (!cancelled) setBots(saved);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Couldn’t load your bots.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function addBot(input: NewBotInput): Promise<Bot> {
    const bot = await createBot(input);
    setBots((prev) => [bot, ...prev]);
    return bot;
  }

  async function removeBot(botId: string) {
    await deleteBot(botId);
    setBots((prev) => prev.filter((b) => b.id !== botId));
  }

  // Stable, so the chat's polling effect doesn't restart on every render.
  const refreshBalance = useCallback(async () => {
    const me = await getMe();
    if (me) setUser(me);
  }, []);

  async function refreshBots() {
    setBots(await listBots());
  }

  async function approveCharacter(botId: string, text: string, second: string) {
    const updated = await saveCharacter(botId, text, second);
    setBots((prev) => prev.map((b) => (b.id === botId ? updated : b)));
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate('/', { replace: true });
    }
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
  const context: BotsContext = { bots, loading, addBot, removeBot, approveCharacter, refreshBots, refreshBalance };

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
          <h2 id="bots-heading" className="dock-heading dock-label">Your bots</h2>
          {loading ? (
            <p className="dock-empty dock-label">Loading…</p>
          ) : bots.length === 0 ? (
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
                    <BotAvatar color={bot.color} />
                    <span className="dock-label dock-bot-name">{bot.name}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* These open inside the app, so the dock stays put. */}
        <nav className="dock-links" aria-label="Info">
          {INFO_LINKS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `dock-item ${isActive ? 'is-active' : ''}`}
              onClick={closeDrawer}
              title={collapsed ? label : undefined}
            >
              <Icon />
              <span className="dock-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="dock-profile">
          <span className="dock-avatar dock-avatar--user" aria-hidden="true">
            {(user?.username ?? '?').charAt(0).toUpperCase()}
          </span>
          <span className="dock-label dock-user">
            <span className="dock-user-name">{user?.username ?? ''}</span>
            {user && (
              <span className="dock-user-credits" title="Available credits">
                {`$${(user.creditsCents / 100).toFixed(2)} credits`}
              </span>
            )}
          </span>
          <button
            type="button"
            className="dock-icon-btn dock-logout"
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
          >
            <LogoutIcon />
          </button>
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
          {loadError && <p className="canvas-error" role="alert">{loadError}</p>}
          <Outlet context={context} />
        </main>
      </div>
    </div>
  );
}
