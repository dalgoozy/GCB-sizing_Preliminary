import React from 'react';

const SingleLineDiagram: React.FC = () => {
  return (
    <div className="w-full flex justify-center py-6 bg-white rounded-lg shadow-sm border border-slate-200">
      <svg width="450" height="300" viewBox="0 0 450 300" className="w-full max-w-md">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#64748b" />
          </marker>
        </defs>

        {/* System Source */}
        <text x="225" y="20" textAnchor="middle" className="text-xs font-bold fill-slate-700">HV SYSTEM GRID</text>
        <rect x="205" y="30" width="40" height="20" stroke="#334155" fill="none" strokeWidth="2" />
        <path d="M205,30 L245,50 M205,50 L245,30" stroke="#334155" strokeWidth="1" />

        {/* Line to GSU */}
        <line x1="225" y1="50" x2="225" y2="80" stroke="#334155" strokeWidth="2" />

        {/* GSU Transformer */}
        <circle cx="225" cy="95" r="15" stroke="#334155" fill="none" strokeWidth="2" />
        <circle cx="225" cy="120" r="15" stroke="#334155" fill="none" strokeWidth="2" />
        <text x="255" y="110" className="text-xs fill-slate-500">GSU</text>

        {/* Line GSU to Node */}
        <line x1="225" y1="135" x2="225" y2="155" stroke="#334155" strokeWidth="2" />
        
        {/* Node for UAT Tap */}
        <circle cx="225" cy="155" r="3" fill="#334155" />

        {/* UAT Branch (Right) */}
        <line x1="225" y1="155" x2="320" y2="155" stroke="#334155" strokeWidth="2" />
        <line x1="320" y1="155" x2="320" y2="170" stroke="#334155" strokeWidth="2" />
        <circle cx="320" cy="185" r="12" stroke="#475569" fill="none" strokeWidth="2" />
        <circle cx="320" cy="205" r="12" stroke="#475569" fill="none" strokeWidth="2" />
        <text x="340" y="200" className="text-xs fill-slate-500">UAT</text>

        {/* Line Node to GCB */}
        <line x1="225" y1="155" x2="225" y2="180" stroke="#334155" strokeWidth="2" />

        {/* GCB Symbol */}
        <rect x="215" y="180" width="20" height="40" stroke="#ef4444" fill="none" strokeWidth="2" rx="2" />
        <line x1="225" y1="185" x2="240" y2="215" stroke="#ef4444" strokeWidth="2" />
        <text x="180" y="205" className="text-sm font-bold fill-red-600">GCB</text>

        {/* Line to Gen */}
        <line x1="225" y1="220" x2="225" y2="250" stroke="#334155" strokeWidth="2" />

        {/* Generator */}
        <circle cx="225" cy="275" r="25" stroke="#334155" fill="none" strokeWidth="2" />
        <text x="225" y="278" textAnchor="middle" className="text-xs font-bold fill-slate-700">G</text>
        <path d="M215,285 C220,280 230,290 235,285" stroke="#334155" fill="none" strokeWidth="1.5" />

        {/* Fault Location Indicators */}
        <path d="M190,165 L210,175 L190,185" stroke="#f59e0b" fill="none" strokeWidth="2" />
        <text x="160" y="180" className="text-xs fill-amber-600">Fault K1/K2</text>
      </svg>
    </div>
  );
};

export default SingleLineDiagram;
