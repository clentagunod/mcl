import { Icon } from '../components/Icon';
import { PublicPage } from '../components/PublicPage';

export default function MaintenancePage() {
  return (
    <PublicPage>
      <section className="card maintenance-card" aria-labelledby="maintenance-title">
        <span className="public-eyebrow">MCL workspace</span>
        <div className="maintenance-illustration" aria-hidden="true">
          <span className="maintenance-orbit" />
          <span className="maintenance-symbol"><Icon name="settings" size={38} /></span>
          <span className="maintenance-clock"><Icon name="clock" size={20} /></span>
        </div>
        <span className="maintenance-status"><span /> Maintenance in progress</span>
        <h1 id="maintenance-title">We’ll be back shortly.</h1>
        <p className="muted">We’re making a few updates to your lending workspace. Please check back in a little while.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.assign('/')}>
          <Icon name="restore" size={17} /> Try again
        </button>
        <p className="maintenance-note">Thank you for your patience.</p>
      </section>
    </PublicPage>
  );
}
