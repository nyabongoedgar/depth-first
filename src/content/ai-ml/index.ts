import type { Course } from '../../core/types';
import a01 from './a01-foundations';
import a02 from './a02-regression';
import a03 from './a03-autograd';
import a04 from './a04-classical';
import a05 from './a05-deep-learning';
import a06 from './a06-estimation-control';

const course: Course = {
  id: 'ai-ml',
  title: 'AI & Machine Learning',
  icon: '🧠',
  tagline: 'From first principles to production: build the learning machinery yourself, then understand perception, estimation and control.',
  level: 'Take Math 5.1–5.4 first',
  modules: [a01, a02, a03, a04, a05, a06],
  planned: [
    { id: 'python-numpy', title: 'Python & NumPy (Pyodide)', topics: 'Vectorisation and broadcasting in a Python runtime in the browser (labs here use JavaScript; the Python track is planned)' },
    { id: 'sequence-models', title: 'Sequence models & language modelling', topics: 'Tokenisation (BPE), n-gram models, RNN/LSTM limits, a tiny GPT end to end' },
    { id: 'generative-models', title: 'Generative models', topics: 'Autoencoders/VAEs, GANs, diffusion intuition' },
    { id: 'training-at-scale', title: 'Training at scale', topics: 'Mixed precision, data/model/pipeline parallelism, checkpointing, throughput analysis' },
    { id: 'efficient-inference', title: 'Efficient inference', topics: 'Quantisation, pruning, distillation, batching, latency budgets, ONNX/edge deployment' },
    { id: 'vision-geometry', title: 'Computer vision & geometry', topics: 'Detection, segmentation, camera models, calibration, stereo, bird\'s-eye-view and occupancy representations' },
    { id: 'reinforcement-learning', title: 'Reinforcement learning', topics: 'MDPs, Q-learning, policy gradients, PPO; imitation learning for driving' },
    { id: 'mlops', title: 'ML engineering & MLOps', topics: 'Data engines, dataset versioning, experiment tracking, serving, shadow/canary, drift monitoring' },
    { id: 'safety-evaluation', title: 'Evaluation, safety & responsible ML', topics: 'Scenario-based testing, closed-loop evaluation, fairness, privacy, robustness' },
    { id: 'llm-apps', title: 'LLM application engineering', topics: 'Prompting, retrieval-augmented generation, evals, tool use, guardrails' },
  ],
};
export default course;
