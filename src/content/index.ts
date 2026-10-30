import type { Course, CourseId } from '../core/types';

export const COURSE_IDS: CourseId[] = ['algos', 'adv-js', 'node-dist', 'cloud', 'ai-ml', 'math'];

/** Each course is its own chunk: the shell stays small and a course downloads on first use. */
export async function loadCourse(id: CourseId): Promise<Course> {
  switch (id) {
    case 'adv-js':
      return (await import('./adv-js/index')).default;
    case 'node-dist':
      return (await import('./node-dist/index')).default;
    case 'cloud':
      return (await import('./cloud/index')).default;
    case 'ai-ml':
      return (await import('./ai-ml/index')).default;
    case 'math':
      return (await import('./math/index')).default;
    case 'algos':
      return (await import('./algos/index')).default;
  }
}

export const COURSE_ORDER_HINT: Record<CourseId, string> = {
  algos: 'Practise weekly from day one',
  'adv-js': 'After the JS Bootcamp',
  'node-dist': 'After Advanced JS',
  cloud: 'After Node & Distributed Systems',
  'ai-ml': 'Take Math 5.1–5.4 first',
  math: 'Start early, in parallel',
};
