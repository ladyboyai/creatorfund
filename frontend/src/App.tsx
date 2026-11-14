import { Link, Route, Routes } from 'react-router-dom';
import { WalletButton, NetworkBadge } from './components/ui';
import { Home } from './pages/Home';
import { Campaigns } from './pages/Campaigns';
import { CreateCampaign } from './pages/CreateCampaign';
import { CampaignDetail } from './pages/CampaignDetail';
import { About } from './pages/About';
import './styles/globals.css';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold text-gray-900">ladyboyai</Link>
            <nav className="hidden sm:flex gap-5 text-sm font-medium text-gray-600">
              <Link to="/campaigns" className="hover:text-near-600">Campaigns</Link>
              <Link to="/create" className="hover:text-near-600">Create</Link>
              <Link to="/about" className="hover:text-near-600">About</Link>
            </nav>
          </div>
          <WalletButton />
        </div>
        <div className="max-w-5xl mx-auto px-4 pb-2"><NetworkBadge /></div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-10">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/create" element={<CreateCampaign />} />
          <Route path="/campaign/:id" element={<CampaignDetail />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </div>
  );
}
