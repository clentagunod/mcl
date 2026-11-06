export function AppFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`site-footer ${className}`}>
      <p>© MCL Lending App <span aria-hidden="true"> · </span> Courtesy of{' '}
        <a href="https://clentindustries.vercel.app" target="_blank" rel="noopener noreferrer">ClentIndustries</a>
      </p>
    </footer>
  );
}
