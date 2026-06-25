import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { LazyMotion, domMax } from 'framer-motion';
import App from './App';
import { AuthProvider } from './lib/authContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {/* Stale-while-revalidate defaults. refreshInterval (set per-hook)
            pauses automatically while the tab is hidden. Pages opt into focus
            revalidation where freshness matters (e.g. the team state machine). */}
        <SWRConfig
          value={{
            revalidateOnFocus: false,
            keepPreviousData: true,
            dedupingInterval: 3000,
            shouldRetryOnError: false,
          }}
        >
          {/* Lake motion runtime (UI Spec §6/§7). domMax = superset incl. layout
              (list reorder lands in a later pass); strict makes raw motion.* throw
              so components stay on m.* and can't drift to the full runtime. */}
          <LazyMotion features={domMax} strict>
            <App />
          </LazyMotion>
        </SWRConfig>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
