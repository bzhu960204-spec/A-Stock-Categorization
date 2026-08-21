import { useState, useEffect } from 'react';
import App from './App';
import HomePage from './HomePage';
import ResearchModule from './ResearchModule';
import CalendarModule from './CalendarModule';
import TechCycleModule from './TechCycleModule';
import IdeaModule from './IdeaModule';
import TradeModule from './TradeModule';
import ValuationModule from './ValuationModule';
import ArchiveModule from './ArchiveModule';

export type ModuleId = 'home' | 'stocks' | 'research' | 'calendar' | 'techcycle' | 'ideas' | 'trades' | 'valuation' | 'archive';

export default function Root() {
  const [module, setModule] = useState<ModuleId>(() => {
    const saved = localStorage.getItem('activeModule');
    return (saved as ModuleId) || 'home';
  });

  useEffect(() => {
    localStorage.setItem('activeModule', module);
  }, [module]);

  if (module === 'stocks') {
    return <App onGoHome={() => setModule('home')} />;
  }
  if (module === 'research') {
    return <ResearchModule onGoHome={() => setModule('home')} />;
  }
  if (module === 'calendar') {
    return <CalendarModule onGoHome={() => setModule('home')} />;
  }
  if (module === 'techcycle') {
    return <TechCycleModule onGoHome={() => setModule('home')} />;
  }
  if (module === 'ideas') {
    return <IdeaModule onGoHome={() => setModule('home')} />;
  }
  if (module === 'trades') {
    return <TradeModule onGoHome={() => setModule('home')} />;
  }
  if (module === 'valuation') {
    return <ValuationModule onGoHome={() => setModule('home')} />;
  }
  if (module === 'archive') {
    return <ArchiveModule onGoHome={() => setModule('home')} />;
  }
  return <HomePage onSelectModule={setModule} />;
}
