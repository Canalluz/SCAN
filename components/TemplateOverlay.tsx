
import React from 'react';

interface TemplateOverlayProps {
  width: number; // Pixels
  height: number; // Pixels
  label: string;
}

const TemplateOverlay: React.FC<TemplateOverlayProps> = ({ width, height, label }) => {
  return (
    <div 
      className="absolute border-2 border-yellow-400 pointer-events-none shadow-[0_0_15px_rgba(250,204,21,0.5)] transition-all duration-300"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Corner indicators */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-yellow-400 -m-0.5"></div>
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-yellow-400 -m-0.5"></div>
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-yellow-400 -m-0.5"></div>
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-yellow-400 -m-0.5"></div>
      
      {/* Label */}
      <div className="absolute -top-8 left-0 right-0 text-center">
        <span className="bg-yellow-400 text-black px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
          Gabarito {label}
        </span>
      </div>

      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 opacity-40">
        <div className="absolute top-1/2 left-0 right-0 h-px bg-yellow-400"></div>
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-yellow-400"></div>
      </div>
    </div>
  );
};

export default TemplateOverlay;
