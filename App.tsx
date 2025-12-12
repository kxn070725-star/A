
import React, { useState } from 'react';
import { WeaveCanvas } from './components/WeaveCanvas';
import { ControlPanel } from './components/ControlPanel';
import { SimulationConfig } from './types';

const App: React.FC = () => {
  const [config, setConfig] = useState<SimulationConfig>({
    particleCount: 15000, 
    connectionDistance: 45, 
    speed: 0.2, 
    interactive: true,
    showGrid: false,
    colorScheme: 'cyber',
    brightness: 1.0,
    staticImage: null,
  });

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans">
      {/* Background Visualization */}
      <WeaveCanvas config={config} />

      {/* Overlay UI */}
      <div className="absolute top-6 left-6 z-10 pointer-events-none">
        <h1 className="text-4xl font-black text-white tracking-tighter mix-blend-difference">
          DIGITAL <span className="text-cyan-400">WEAVE</span>
        </h1>
        <p className="text-cyan-200/60 text-sm mt-1 tracking-widest uppercase">
          Quantum Shader Core
        </p>
      </div>

      {/* Interactive Controls */}
      <ControlPanel 
        config={config} 
        setConfig={setConfig} 
      />

      {/* Footer Info */}
      <div className="absolute bottom-6 left-6 z-10 pointer-events-none opacity-60">
        <div className="text-xs text-white/50 space-y-1">
           <div className="flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-red-500"></span>
             <span className="font-bold text-red-500">FIST:</span> Reality Lens
           </div>
           <div className="flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
             <span className="font-bold text-cyan-400">OPEN HAND:</span> Wave Flow
           </div>
           <div className="flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-purple-500"></span>
             <span className="font-bold text-purple-500">PINCH:</span> Tension
           </div>
        </div>
      </div>
    </div>
  );
};

export default App;
