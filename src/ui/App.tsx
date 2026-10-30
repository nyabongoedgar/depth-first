import { route, href } from './router';
import { Home, CoursePage, ModulePage } from './pages';
import { Review, Interview, Skills, Search, Settings } from './pages2';
import { progress, ready } from '../store/progress';
import { dueCards } from '../store/srs';

function Nav() {
  const due = dueCards().length;
  const r = route.value.name;
  const link = (name: string, label: string, to: string, badge?: number) => (
    <a class={r === name ? 'active' : ''} href={to}>{label}{badge ? <span class="badge-count">{badge}</span> : null}</a>
  );
  return (
    <header class="topbar">
      <a class="brand" href={href.home()}><span class="logo">D</span><span>Depth First</span></a>
      <nav>
        {link('home', 'Courses', href.home())}
        {link('review', 'Review', href.review(), due)}
        {link('interview', 'Interview', href.interview())}
        {link('skills', 'Skills', href.skills())}
      </nav>
      <form class="search" onSubmit={(e) => { e.preventDefault(); const q = (e.currentTarget.elements.namedItem('q') as HTMLInputElement).value; location.hash = href.search(q); }}>
        <input name="q" type="search" placeholder="Search…" aria-label="Search lessons" />
      </form>
      <a class="icon-link" href={href.settings()} title="Settings" aria-label="Settings">⚙</a>
    </header>
  );
}

export function App() {
  if (!ready.value) return <p class="loading dim">Loading…</p>;
  const r = route.value;
  progress.value; // subscribe: re-render on progress changes
  let page;
  switch (r.name) {
    case 'home': page = <Home />; break;
    case 'course': page = <CoursePage id={r.course} />; break;
    case 'module': page = <ModulePage key={r.module} courseId={r.course} moduleId={r.module} />; break;
    case 'review': page = <Review />; break;
    case 'interview': page = <Interview labId={r.lab} />; break;
    case 'skills': page = <Skills />; break;
    case 'search': page = <Search q={r.q} />; break;
    case 'settings': page = <Settings />; break;
  }
  return (
    <>
      <Nav />
      <main class={r.name === 'module' ? 'wide' : ''}>{page}</main>
      <footer class="footer dim">Depth First · runs entirely in your browser · <a href="https://github.com/" rel="noopener" onClick={(e) => e.preventDefault()}>open source</a></footer>
    </>
  );
}
