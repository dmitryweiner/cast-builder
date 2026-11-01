import './style.css';
import { startApp } from './app';
import { registerServiceWorker } from './pwa';
import { browserStorage } from './storage';

startApp({ storage: browserStorage(), languages: navigator.languages });
if (import.meta.env.PROD) registerServiceWorker(navigator, window);
