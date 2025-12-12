
export type ParticleState = 'grid' | 'sphere';

export interface Particle {
  x: number;
  y: number;
  z: number; // 3D depth
  ox: number; // Origin X for grid anchor
  oy: number; // Origin Y for grid anchor
  vx: number;
  vy: number;
  radius: number;
  id: number;
  
  // State management
  state: ParticleState;

  // Mapping coordinates
  u: number; // 0-1 texture coordinate X
  v: number; // 0-1 texture coordinate Y
}

export interface SimulationConfig {
  particleCount: number;
  connectionDistance: number;
  speed: number;
  interactive: boolean;
  showGrid: boolean;
  colorScheme: 'cyber' | 'warm' | 'matrix';
  brightness: number;
  staticImage: string | null;
}
