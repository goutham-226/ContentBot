import { Link } from 'react-router';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <nav className="footer-nav" aria-label="Footer">
        <Link to="/about">About</Link>
        <Link to="/pricing">Pricing</Link>
        <Link to="/help">Help</Link>
        <a href="#">Privacy</a>
        <a href="#">Terms</a>
      </nav>
      <p className="copyright">© 2026 TwinFluencer</p>
    </footer>
  );
}
