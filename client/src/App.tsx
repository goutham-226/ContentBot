import { BrowserRouter, Route, Routes } from 'react-router';
import LoginPage from './pages/LoginPage/LoginPage';
import AboutPage from './pages/AboutPage/AboutPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
