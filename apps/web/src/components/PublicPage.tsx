import type { ReactNode } from 'react';
import { AppFooter } from './AppFooter';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

export function PublicPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`public-page ${className}`}>
      <header className="public-header">
        <a className="public-brand" href="/" aria-label="MCL Lending App home">
          <Logo />
          <span>MCL Lending App<small>Lending administration</small></span>
        </a>
        <ThemeToggle />
      </header>
      <main className="public-main">{children}</main>
      <AppFooter />
    </div>
  );
}
