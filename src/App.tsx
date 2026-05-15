import { useState } from 'react';
import HomeView from './components/HomeView';
import SpiritSelectView from './components/SpiritSelectView';
import GameView from './components/GameView';
import RulesView from './components/RulesView';

export type ViewName = 'home' | 'select' | 'game' | 'rules';

export default function App() {
  const [view, setView] = useState<ViewName>('home');

  switch (view) {
    case 'home':
      return <HomeView onNavigate={setView} />;
    case 'select':
      return <SpiritSelectView onNavigate={setView} />;
    case 'game':
      return <GameView onNavigate={setView} />;
    case 'rules':
      return <RulesView onBack={() => setView('home')} />;
  }
}
