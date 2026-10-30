import type { Course } from '../../core/types';
import c01 from './c01-networking';
import c02 from './c02-iam-slo';

const course: Course = {
  id: 'cloud',
  title: 'Cloud Engineering (Simulated)',
  icon: '☁️',
  tagline: 'Networking, identity, reliability and infrastructure reasoning — practised against deterministic models, with no cloud account or bill.',
  level: 'After Node & Distributed Systems',
  modules: [c01, c02],
  planned: [
    { id: 'iac-planner', title: 'Infrastructure as Code', topics: 'Declarative desired state, dependency graphs, plan/apply diffing, drift' },
    { id: 'compute-containers', title: 'Compute & containers', topics: 'VMs vs containers vs functions, images, cold starts, autoscaling math' },
    { id: 'kubernetes', title: 'Kubernetes scheduling', topics: 'Pods, requests/limits, bin-packing, affinity, rolling updates' },
    { id: 'storage-db', title: 'Storage & databases', topics: 'Object/block/file, replication, backups, RPO/RTO' },
    { id: 'load-balancing', title: 'Load balancing & CDNs', topics: 'L4 vs L7, health checks, consistent hashing, caching' },
    { id: 'observability', title: 'Observability', topics: 'Metrics, logs, traces, cardinality, alert design' },
    { id: 'dr-multiregion', title: 'Disaster recovery & multi-region', topics: 'Active-active vs active-passive, failover, game days' },
    { id: 'finops', title: 'Cost engineering (FinOps)', topics: 'Pricing models, right-sizing, reservations, unit economics' },
    { id: 'security-compliance', title: 'Cloud security', topics: 'Zero trust, secrets, encryption, threat modelling, supply chain' },
  ],
};
export default course;
