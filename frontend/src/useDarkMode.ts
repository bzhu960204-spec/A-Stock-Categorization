import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/** Dark-mode state persisted to localStorage and reflected on the document root. */
export function useDarkMode(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  return [darkMode, setDarkMode];
}
