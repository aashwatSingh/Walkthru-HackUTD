import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthProvider.jsx';
import { ToastProvider } from './components/ui.jsx';
import { misconfigured } from './lib/supabaseClient.js';

// Shown instead of the app when a deployed build has no database settings (see supabaseClient.js).
function NotConfigured() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-10">
      <div className="panel border-warn/50 p-6" role="alert">
        <h1 className="display text-2xl">This site is not connected to its database</h1>
        <p className="mt-3 text-soft">Nothing can be saved, so the app is switched off to keep anyone from doing an inspection that would be lost.</p>
        <p className="mt-4 text-sm text-muted-foreground">If you run this site: in Vercel → Project → Settings → Environment Variables, set <code className="font-mono text-neon">VITE_SUPABASE_URL</code> and <code className="font-mono text-neon">VITE_SUPABASE_ANON_KEY</code>, then redeploy. For a sample-data demo with no database, set <code className="font-mono text-neon">VITE_DEMO_MODE=true</code> instead.</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  misconfigured ? <NotConfigured /> :
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
