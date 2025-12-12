
import React, { useRef, useState } from 'react';
import { SimulationConfig } from '../types';

interface ControlPanelProps {
  config: SimulationConfig;
  setConfig: React.Dispatch<React.SetStateAction<SimulationConfig>>;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ config, setConfig }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleChange = (key: keyof SimulationConfig, value: number | string | boolean | null) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          handleChange('staticImage', event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Collapsed View (Icon only)
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="absolute top-4 right-4 z-20 p-3 bg-black/60 backdrop-blur-md border border-gray-700 rounded-lg text-cyan-400 hover:bg-gray-800 hover:text-white transition-all shadow-lg hover:shadow-cyan-500/20 group"
        title="Open Controls"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:rotate-90 transition-transform duration-300">
          <line x1="4" y1="21" x2="4" y2="14"></line>
          <line x1="4" y1="10" x2="4" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12" y2="3"></line>
          <line x1="20" y1="21" x2="20" y2="16"></line>
          <line x1="20" y1="12" x2="20" y2="3"></line>
          <line x1="1" y1="14" x2="7" y2="14"></line>
          <line x1="9" y1="8" x2="15" y2="8"></line>
          <line x1="17" y1="16" x2="23" y2="16"></line>
        </svg>
      </button>
    );
  }

  // Expanded View
  return (
    <div className="absolute top-4 right-4 w-80 bg-black/80 backdrop-blur-md border border-gray-800 p-6 rounded-xl shadow-2xl text-white z-10 transition-all duration-300 hover:border-cyan-500/50 animate-fade-in-down">
      <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
        <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          Network Control
        </h2>
        <button 
          onClick={() => setIsExpanded(false)}
          className="text-gray-500 hover:text-white transition-colors p-1 rounded hover:bg-gray-800"
          title="Minimize"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      </div>

      <div className="mb-6 flex items-center space-x-3 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
        <div className="relative flex h-3 w-3">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.staticImage ? 'bg-blue-400' : 'bg-red-400'}`}></span>
          <span className={`relative inline-flex rounded-full h-3 w-3 ${config.staticImage ? 'bg-blue-500' : 'bg-red-500'}`}></span>
        </div>
        <div>
          <p className="text-xs font-semibold text-white">{config.staticImage ? 'Static Image Mode' : 'Live Feed Active'}</p>
          <p className="text-[10px] text-gray-400">{config.staticImage ? 'Using imported background' : 'Processing real-world data'}</p>
        </div>
      </div>

      <div className="space-y-6">
        
         {/* Image Upload */}
         <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-400">
              <label>Background Source</label>
            </div>
            <div className="flex space-x-2">
                <label className="flex-1 cursor-pointer bg-gray-800 hover:bg-gray-700 text-white text-xs py-2 px-3 rounded-md text-center transition-colors border border-gray-700 hover:border-gray-600">
                  <span>Upload Image</span>
                  <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleImageUpload} 
                  />
                </label>
                {config.staticImage && (
                    <button 
                      onClick={() => handleChange('staticImage', null)}
                      className="bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-red-400 text-xs py-2 px-3 rounded-md transition-colors"
                    >
                      Clear
                    </button>
                )}
            </div>
          </div>

        {/* Toggle Grid */}
        <div className="flex items-center justify-between">
           <label className="text-sm text-gray-400">Show Guide Grid</label>
           <input 
             type="checkbox"
             checked={config.showGrid}
             onChange={(e) => handleChange('showGrid', e.target.checked)}
             className="w-4 h-4 rounded accent-cyan-500"
           />
        </div>

        {/* Particle Count */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-400">
            <label>Mesh Density</label>
            <span>{config.particleCount}</span>
          </div>
          <input
            type="range"
            min="2000"
            max="50000"
            step="1000"
            value={config.particleCount}
            onChange={(e) => handleChange('particleCount', parseInt(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
        </div>

        {/* Speed */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-400">
            <label>Fluctuation Speed</label>
            <span>{config.speed.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.0"
            max="3.0"
            step="0.1"
            value={config.speed}
            onChange={(e) => handleChange('speed', parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
          />
        </div>
        
        {/* Brightness */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-400">
            <label>Brightness</label>
            <span>{(config.brightness * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="2.5"
            step="0.1"
            value={config.brightness}
            onChange={(e) => handleChange('brightness', parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
          />
        </div>

        {/* Color Scheme */}
        <div className="space-y-2">
          <label className="text-sm text-gray-400 block">Default Theme</label>
          <div className="flex space-x-2">
            {(['cyber', 'warm', 'matrix'] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => handleChange('colorScheme', theme)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                  config.colorScheme === theme
                    ? 'bg-white text-black'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {theme}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
