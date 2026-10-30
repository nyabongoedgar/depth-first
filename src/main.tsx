import { render } from 'preact';
import { App } from './ui/App';
import { loadProgress, progress } from './store/progress';
import { effect } from '@preact/signals';
import './styles.css';

// apply the saved theme before first paint where possible
effect(() => {
  const t = progress.value.settings.theme;
  document.documentElement.dataset.theme = t === 'auto' ? '' : t;
});

loadProgress().then(() => render(<App />, document.getElementById('app')!));

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
