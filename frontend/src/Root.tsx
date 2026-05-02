import { useState, useEffect } from 'react';
import App from './App';
import HomePage from './HomePage';
import ResearchModule from './ResearchModule';

export type ModuleId = 'home' | 'stocks' | 'research';

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
  return <HomePage onSelectModule={setModule} />;
}
