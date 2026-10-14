import '@fontsource/libre-bodoni/latin-400.css';
import '@fontsource/libre-bodoni/latin-400-italic.css';
import '@fontsource/libre-bodoni/latin-700.css';
import '@fontsource/libre-bodoni/latin-700-italic.css';
import '@fontsource/libre-baskerville/latin-400.css';
import '@fontsource/libre-baskerville/latin-400-italic.css';
import '@fontsource/libre-baskerville/latin-700.css';
import '@fontsource/libre-baskerville/latin-700-italic.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/cormorant-garamond/latin-700.css';
import '@fontsource/cormorant-garamond/latin-700-italic.css';
import '@fontsource/roboto-condensed/400-italic.css';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import '@fontsource/asap/400.css';
import '@fontsource/asap/700.css';
import '@fontsource/barlow-condensed/400.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-semi-condensed/400.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/700.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
