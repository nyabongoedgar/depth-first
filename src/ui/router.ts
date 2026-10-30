import { signal } from '@preact/signals';
import type { CourseId } from '../core/types';

export type Route =
  | { name: 'home' }
  | { name: 'course'; course: CourseId }
  | { name: 'module'; course: CourseId; module: string }
  | { name: 'review' }
  | { name: 'interview'; lab?: string }
  | { name: 'skills' }
  | { name: 'search'; q: string }
  | { name: 'settings' };

function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  switch (parts[0]) {
    case 'c':
      if (parts[2]) return { name: 'module', course: parts[1] as CourseId, module: parts[2] };
      if (parts[1]) return { name: 'course', course: parts[1] as CourseId };
      return { name: 'home' };
    case 'review':
      return { name: 'review' };
    case 'interview':
      return { name: 'interview', lab: parts[1] };
    case 'skills':
      return { name: 'skills' };
    case 'search':
      return { name: 'search', q: decodeURIComponent(new URLSearchParams(query).get('q') ?? '') };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'home' };
  }
}

export const route = signal<Route>(parse(location.hash));
window.addEventListener('hashchange', () => {
  route.value = parse(location.hash);
  window.scrollTo(0, 0);
});

export const href = {
  home: () => '#/',
  course: (c: CourseId) => `#/c/${c}`,
  module: (c: CourseId, m: string) => `#/c/${c}/${m}`,
  review: () => '#/review',
  interview: (lab?: string) => (lab ? `#/interview/${lab}` : '#/interview'),
  skills: () => '#/skills',
  search: (q: string) => `#/search?q=${encodeURIComponent(q)}`,
  settings: () => '#/settings',
};
