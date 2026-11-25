import { useEffect, useState } from 'react';

export const pages = {
  home: 'בית',
  stations: 'עמדות עבודה',
  calendar: 'חדר ישיבות',
  requests: 'בקשות והזמנות',
  users: 'ניהול משתמשים',
};

export type Page = keyof typeof pages;

function currentPage(): Page {
  const hash = location.hash.slice(1).split('?')[0];
  return Object.hasOwn(pages, hash) ? (hash as Page) : 'home';
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => location.hash);
  const page = currentPage();
  useEffect(() => {
    const change = () => setRoute(location.hash);
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const navigate = (page: Page) => {
    location.hash = page;
  };
  return { page, route, navigate };
}
