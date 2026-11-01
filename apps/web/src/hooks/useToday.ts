import { useEffect, useState } from 'react';
import { todayISO, type ISODate } from '../lib/dates';

const CHECK_INTERVAL_MS = 60_000;

/** Today's date, refreshed automatically so statuses update if the page is left open past midnight. */
export function useToday(): ISODate {
  const [today, setToday] = useState<ISODate>(() => todayISO());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday((previous) => {
        const current = todayISO();
        return current === previous ? previous : current;
      });
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return today;
}
