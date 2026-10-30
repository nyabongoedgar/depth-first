import type { Course } from '../../core/types';
import n01 from './n01-intro';
import n02 from './n02-clocks';
import n03 from './n03-quorums';
import n04 from './n04-raft';
import n05 from './n05-partitioning';
import n06 from './n06-crdts';

const course: Course = {
  id: 'node-dist',
  title: 'Node.js & Distributed Systems',
  icon: '🌐',
  tagline: 'Build backends that stay correct and available when machines, networks and clocks misbehave.',
  level: 'After Advanced JS',
  modules: [n01, n02, n03, n04, n05, n06],
  planned: [],
};
export default course;
