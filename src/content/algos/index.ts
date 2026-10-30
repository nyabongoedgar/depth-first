import type { Course } from '../../core/types';
import a01 from './a01-complexity';
import a02 from './a02-arrays-strings';
import a03 from './a03-hashing';
import a04 from './a04-stacks-queues';
import a05 from './a05-linked-lists';
import a06 from './a06-backtracking';
import a07 from './a07-sorting-searching';
import a08 from './a08-trees';
import a09 from './a09-heaps';
import a10 from './a10-graphs-1';
import a11 from './a11-graphs-2';
import a12 from './a12-dp-1';

const course: Course = {
  id: 'algos',
  title: 'Algorithms, Data Structures & Interview Practice',
  icon: '🧩',
  tagline: 'Recognise the pattern, pick the structure, prove the complexity — under time pressure.',
  level: 'Practise weekly from day one',
  modules: [a01, a02, a03, a04, a05, a06, a07, a08, a09, a10, a11, a12],
  planned: [],
};
export default course;
