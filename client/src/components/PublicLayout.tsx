import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import './PublicLayout.css';
import Footer from './Footer';

// Shell for the logged-out pages: About, Pricing, Help.
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public">
      <header className="public-header">
        <Link to="/" className="public-brand">
          <img src="/logo.svg" alt="" />
          <span>Twinfluencer</span>
        </Link>
        <nav className="public-nav" aria-label="Main">
          <NavLink to="/about">About</NavLink>
          <NavLink to="/pricing">Pricing</NavLink>
          <NavLink to="/help">Help</NavLink>
          <Link to="/" className="public-login">Log in</Link>
        </nav>
      </header>

      <main className="public-main">{children}</main>

      <Footer />
    </div>
  );
}
