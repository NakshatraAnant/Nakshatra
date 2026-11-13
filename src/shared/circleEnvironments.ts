/**
 * Circle environments: five places a circle can live in. One configuration drives the 3D scene, the flat
 * fallback and the picker, so adding a sixth is one entry here. Purely visual; membership and permissions are
 * unaffected.
 */
export const CIRCLE_ENVIRONMENTS = [
  { key: 'observatory', label: 'Observatory', line: 'A dome open to the sky.', sky: ['#070a1c', '#27306b'], accent: '#b9c2e6' },
  { key: 'garden', label: 'Celestial Garden', line: 'Things growing in starlight.', sky: ['#06150f', '#1f5a45'], accent: '#9bdaa9' },
  { key: 'islands', label: 'Floating Islands', line: 'Small lands adrift together.', sky: ['#0a1422', '#2f6f9a'], accent: '#8fd1fd' },
  { key: 'studio', label: 'Creative Studio', line: 'Frames, tools and work in progress.', sky: ['#1a0e08', '#8a4a22'], accent: '#f6a26a' },
  { key: 'sanctuary', label: 'Cosmic Sanctuary', line: 'Quiet rings of light.', sky: ['#140b1f', '#5d3f7a'], accent: '#d8c7ff' },
] as const;
export type CircleEnvironment = (typeof CIRCLE_ENVIRONMENTS)[number]['key'];
export const CIRCLE_ENVIRONMENT_KEYS = CIRCLE_ENVIRONMENTS.map((e) => e.key) as [CircleEnvironment, ...CircleEnvironment[]];
export const environmentFor = (key: string | null | undefined) => CIRCLE_ENVIRONMENTS.find((e) => e.key === key) ?? CIRCLE_ENVIRONMENTS[0];
