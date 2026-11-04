import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DataContext } from '../../src/context/DataContext';
import HolidaysPage from '../../src/pages/HolidaysPage';
import type { Holiday } from '../../src/types';
import '../../src/index.css';

const initialHolidays: Holiday[] = [
  { date: '2026-11-01', name: 'All Saints Day' },
  { date: '2026-11-30', name: 'Bonifacio Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
];

function HolidayFixture() {
  const [holidays, setHolidays] = useState(initialHolidays);
  useEffect(() => {
    function saved(event: Event) {
      const holiday = (event as CustomEvent<Holiday>).detail;
      setHolidays(previous => [...previous.filter(value => value.date !== holiday.date), holiday]);
    }
    window.addEventListener('fixture:holiday-saved', saved);
    return () => window.removeEventListener('fixture:holiday-saved', saved);
  }, []);
  return <DataContext.Provider value={{ clients: [], payments: [], collectors: [], holidays, rows: [], today: '2026-11-04', loading: false, error: null }}><main className="content"><HolidaysPage /></main></DataContext.Provider>;
}

createRoot(document.getElementById('root')!).render(<HolidayFixture />);
