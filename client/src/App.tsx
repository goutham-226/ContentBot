import { BrowserRouter, Route, Routes } from 'react-router';
import LoginPage from './pages/LoginPage/LoginPage';
import AboutPage, { AboutContent } from './pages/AboutPage/AboutPage';
import PricingPage, { PricingContent } from './pages/PricingPage/PricingPage';
import HelpPage, { HelpContent } from './pages/HelpPage/HelpPage';
import SignupPage from './pages/SignupPage/SignupPage';
import DashboardPage from './pages/DashboardPage/DashboardPage';
import NewBotPanel from './pages/DashboardPage/NewBotPanel';
import BotPanel from './pages/DashboardPage/BotPanel';
import InAppPage from './pages/DashboardPage/InAppPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Logged out: public header and footer */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/help" element={<HelpPage />} />

        {/* Logged in: everything renders next to the side dock */}
        <Route path="/app" element={<DashboardPage />}>
          <Route index element={<NewBotPanel />} />
          <Route path="bots/:botId" element={<BotPanel />} />
          <Route path="about" element={<InAppPage><AboutContent /></InAppPage>} />
          <Route path="pricing" element={<InAppPage><PricingContent /></InAppPage>} />
          <Route path="help" element={<InAppPage><HelpContent /></InAppPage>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
