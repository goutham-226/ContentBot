import { BrowserRouter, Route, Routes } from 'react-router';
import LoginPage from './pages/LoginPage/LoginPage';
import AboutPage from './pages/AboutPage/AboutPage';
import PricingPage from './pages/PricingPage/PricingPage';
import HelpPage from './pages/HelpPage/HelpPage';
import SignupPage from './pages/SignupPage/SignupPage';
import DashboardPage from './pages/DashboardPage/DashboardPage';
import NewBotPanel from './pages/DashboardPage/NewBotPanel';
import BotPanel from './pages/DashboardPage/BotPanel';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/app" element={<DashboardPage />}>
          <Route index element={<NewBotPanel />} />
          <Route path="bots/:botId" element={<BotPanel />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
