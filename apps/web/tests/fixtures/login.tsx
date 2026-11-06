import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../src/context/AuthContext';
import { initializeTheme } from '../../src/lib/theme';
import LoginPage from '../../src/pages/LoginPage';
import '../../src/index.css';

// Synthetic sign-in only: this fixture never initializes Firebase or uses live accounts.
initializeTheme();
createRoot(document.getElementById('root')!).render(
  <AuthContext.Provider value={{
    status: 'signedOut', user: null, profile: null, accessError: null,
    signIn: async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      throw new Error('Sign-in could not be completed. Please try again.');
    },
    signOut: async () => {},
  }}>
    <MemoryRouter><LoginPage /></MemoryRouter>
  </AuthContext.Provider>,
);
