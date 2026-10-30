import type { Course } from '../../core/types';
import k01 from './k01-linear-algebra';
import k02 from './k02-calculus';
import k03 from './k03-probability';

const course: Course = {
  id: 'math',
  title: 'Mathematics for Software Engineers',
  icon: '∑',
  tagline: 'The math behind algorithms, systems, graphics, security, data and machine learning.',
  level: 'Start early, in parallel',
  modules: [k01, k02, k03],
  planned: [],
};
export default course;
