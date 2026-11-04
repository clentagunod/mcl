import { useTheme } from '../lib/theme';
import { Icon } from './Icon';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
  return <button type="button" className="icon-button theme-toggle" aria-label={label} title={label} data-tooltip={label} onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} /></button>;
}
