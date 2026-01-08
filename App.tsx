import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity, Zap, Server, Settings, AlertTriangle, CheckCircle, Info, Database, FileText, Download, Loader2, Save, FolderOpen, Trash2 } from 'lucide-react';
import SingleLineDiagram from './components/SingleLineDiagram';
import { GeneratorData, TransformerData, SystemData, UatData, CalculationResult } from './types';
import { calculateSystemSourceFault, calculateGeneratorSourceFault, generateWaveformData } from './utils/electricalCalculations';
import { getEngineeringAssessment } from './services/geminiService';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// --- Types for Saved Data ---
interface SavedProject {
  genData: GeneratorData;
  gsuData: TransformerData;
  uatData: UatData;
  sysData: SystemData;
  partingTime: number;
  marginPercent: number;
  timestamp: number;
}

const App: React.FC = () => {
  // --- State ---
  const [projectName, setProjectName] = useState<string>("GCB Sizing Project - 001");
  const [savedProjects, setSavedProjects] = useState<string[]>([]);
  
  const [genData, setGenData] = useState<GeneratorData>({
    mva: 100,
    voltageKv: 13.8,
    powerFactor: 0.85,
    subtransientReactanceXd: 15, // %
    xrRatio: 30
  });

  const [gsuData, setGsuData] = useState<TransformerData>({
    mva: 120,
    impedanceZ: 10,
    xrRatio: 40,
    primaryVoltageKv: 154,
    secondaryVoltageKv: 13.8
  });
  
  const [uatData, setUatData] = useState<UatData>({
    mva: 10,
    impedanceZ: 8,
    xrRatio: 15,
    secondaryVoltageKv: 4.16
  });

  const [sysData, setSysData] = useState<SystemData>({
    shortCircuitCapacityMva: 10000,
    xrRatio: 15
  });

  const [partingTime, setPartingTime] = useState<number>(50); // ms
  const [marginPercent, setMarginPercent] = useState<number>(10); // %
  
  const [aiAssessment, setAiAssessment] = useState<string>("");
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // --- Effects ---
  // Load list of saved projects on mount
  useEffect(() => {
    updateSavedProjectsList();
  }, []);

  const updateSavedProjectsList = () => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('gcb_proj_')) {
        keys.push(key.replace('gcb_proj_', ''));
      }
    }
    setSavedProjects(keys.sort());
  };

  // --- Calculations ---
  const sysResult = useMemo(() => 
    calculateSystemSourceFault(genData, gsuData, sysData, partingTime),
  [genData, gsuData, sysData, partingTime]);

  const genResult = useMemo(() => 
    calculateGeneratorSourceFault(genData, partingTime),
  [genData, partingTime]);

  // Waveform Data
  const chartData = useMemo(() => 
    generateWaveformData(genResult.symmetricalCurrentkA, genResult.timeConstantMs),
  [genResult]);

  // --- Rating Selection Logic ---
  const ratings = useMemo(() => {
    // 1. Calculate base values
    const continuousCurrentA = (genData.mva * 1000) / (Math.sqrt(3) * genData.voltageKv);
    const maxSymKA = Math.max(sysResult.symmetricalCurrentkA, genResult.symmetricalCurrentkA);
    const maxAsymKA = Math.max(sysResult.asymmetricalCurrentkA, genResult.asymmetricalCurrentkA);
    const maxPeakKA = Math.max(sysResult.peakCurrentkA, genResult.peakCurrentkA); // Closing & Latching

    // 2. Apply Margin
    const marginFactor = 1 + (marginPercent / 100);
    const marginContinuousA = continuousCurrentA * marginFactor;
    const marginSymKA = maxSymKA * marginFactor;
    const marginAsymKA = maxAsymKA * marginFactor;
    const marginPeakKA = maxPeakKA * marginFactor;

    // 3. Select Standard Rating
    // Continuous Current: Round up to nearest 500A
    const selectedCurrentA = Math.ceil(marginContinuousA / 500) * 500;

    // Symmetrical Breaking: Standard List
    const stdBreakKA = [31.5, 40, 50, 63, 72, 80, 90, 100, 120, 140, 160, 190, 200];
    // Find closest standard greater than margin value
    const selectedSymKA = stdBreakKA.find(k => k >= marginSymKA) || stdBreakKA[stdBreakKA.length - 1];
    
    // Derived Ratings
    const derivedPeakKA = selectedSymKA * 2.74;
    const derivedAsymKA = selectedSymKA * 1.732; 

    return {
      continuous: { calc: continuousCurrentA, margin: marginContinuousA, selected: selectedCurrentA },
      sym: { calc: maxSymKA, margin: marginSymKA, selected: selectedSymKA },
      asym: { calc: maxAsymKA, margin: marginAsymKA, selected: derivedAsymKA },
      peak: { calc: maxPeakKA, margin: marginPeakKA, selected: derivedPeakKA }
    };
  }, [sysResult, genResult, genData, marginPercent]);


  // --- Handlers ---
  const handleAiAnalysis = async () => {
    setLoadingAi(true);
    const text = await getEngineeringAssessment(sysResult, genResult, genData);
    setAiAssessment(text);
    setLoadingAi(false);
  };

  const handleSaveProject = () => {
    if (!projectName.trim()) {
      alert("Please enter a project name.");
      return;
    }
    const dataToSave: SavedProject = {
      genData, gsuData, uatData, sysData, partingTime, marginPercent,
      timestamp: Date.now()
    };
    try {
      localStorage.setItem(`gcb_proj_${projectName}`, JSON.stringify(dataToSave));
      updateSavedProjectsList();
      alert(`Project "${projectName}" saved successfully!`);
    } catch (e) {
      alert("Failed to save project. Local storage might be full.");
    }
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedName = e.target.value;
    if (!selectedName) return;

    try {
      const item = localStorage.getItem(`gcb_proj_${selectedName}`);
      if (item) {
        const data: SavedProject = JSON.parse(item);
        setGenData(data.genData);
        setGsuData(data.gsuData);
        setUatData(data.uatData || uatData); // Fallback for old saves
        setSysData(data.sysData);
        setPartingTime(data.partingTime);
        setMarginPercent(data.marginPercent);
        setProjectName(selectedName);
        setAiAssessment(""); // Clear old assessment
      }
    } catch (error) {
      console.error("Error loading project", error);
      alert("Failed to load project data.");
    }
  };

  const handleExportPdf = async () => {
    const element = document.getElementById('app-container');
    if (!element) return;
    
    setIsExporting(true);
    
    try {
      // 1. Capture the element
      const canvas = await html2canvas(element, {
        scale: 2, // High resolution
        useCORS: true,
        logging: false,
        backgroundColor: '#f8fafc',
        ignoreElements: (element) => element.hasAttribute('data-html2canvas-ignore')
      });

      const imgData = canvas.toDataURL('image/png');
      
      // 2. Setup PDF (A4)
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();   // 210mm
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm
      
      // 3. Calculate Dimensions to "Fit Width" (Full Screen Width)
      const imgProps = pdf.getImageProperties(imgData);
      const margin = 0; // No margin for full width
      const contentWidth = pdfWidth - (2 * margin);
      const contentHeight = (imgProps.height * contentWidth) / imgProps.width;
      
      // 4. Add Image & Handle Pagination
      let heightLeft = contentHeight;
      let position = 0;

      // First Page
      pdf.addImage(imgData, 'PNG', margin, position, contentWidth, contentHeight);
      heightLeft -= pdfHeight;

      // Subsequent Pages
      while (heightLeft > 0) {
        position = heightLeft - contentHeight; // Adjust position for next page
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position - heightLeft - pdfHeight + contentHeight , contentWidth, contentHeight); // Logic for continuous scrolling pages is tricky in jsPDF
        // Simpler pagination logic for vertical flow:
        // Actually, jsPDF 'position' is from top of page.
        // For simple reports, we just print the next slice.
        // However, slicing image data is complex. 
        // Standard approach: Print the whole image shifted up.
        pdf.addImage(imgData, 'PNG', margin, position - (contentHeight - heightLeft) - pdfHeight, contentWidth, contentHeight); 
        heightLeft -= pdfHeight;
      }
      
      // Simpler Multi-page approach for clear cut:
      // If we want exact paging, we usually iterate. 
      // Reverting to the standard reliable multi-page loop:
      
      /* Reset for robust loop */
      const pdf2 = new jsPDF('p', 'mm', 'a4');
      const pWidth = pdf2.internal.pageSize.getWidth();
      const pHeight = pdf2.internal.pageSize.getHeight();
      const iHeight = (imgProps.height * pWidth) / imgProps.width;
      let hLeft = iHeight;
      let pos = 0;

      pdf2.addImage(imgData, 'PNG', 0, pos, pWidth, iHeight);
      hLeft -= pHeight;

      while (hLeft >= 0) {
        pos = hLeft - iHeight;
        pdf2.addPage();
        pdf2.addImage(imgData, 'PNG', 0, pos, pWidth, iHeight);
        hLeft -= pHeight;
      }


      const cleanProjectName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      pdf2.save(`${cleanProjectName}_GCB_Sizing_Report.pdf`);

    } catch (error) {
      console.error("PDF Export failed:", error);
      alert("Failed to export PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div id="app-container" className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-10">
      {/* Header */}
      <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-50 print:hidden">
        <div className="max-w-7xl mx-auto p-4">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            
            {/* Title */}
            <div className="flex items-center gap-3 shrink-0">
              <Zap className="h-6 w-6 text-yellow-400 shrink-0" />
              <div>
                <h1 className="text-xl font-bold tracking-tight leading-none">GCB Sizing Engineer</h1>
                <span className="text-slate-400 text-xs">IEC/IEEE 62271-37-013 Standard</span>
              </div>
            </div>

            {/* Controls Bar */}
            <div className="flex-1 flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto xl:justify-end">
              
              {/* Save/Load Section */}
              <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-lg border border-slate-700 w-full md:w-auto">
                <FileText className="w-4 h-4 text-slate-400 ml-2 shrink-0" />
                <input 
                  type="text" 
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Project Name..."
                  className="bg-transparent border-none text-white text-sm w-full md:w-40 focus:ring-0 placeholder-slate-500"
                />
                
                <button 
                  onClick={handleSaveProject}
                  data-html2canvas-ignore="true"
                  title="Save Project"
                  className="p-1.5 bg-green-600 hover:bg-green-700 rounded text-white transition shrink-0"
                >
                  <Save className="w-4 h-4" />
                </button>

                <div className="relative group shrink-0" data-html2canvas-ignore="true">
                   <div className="flex items-center bg-slate-700 rounded overflow-hidden">
                      <div className="p-1.5 text-slate-300">
                        <FolderOpen className="w-4 h-4" />
                      </div>
                      <select 
                        onChange={handleLoadProject}
                        value=""
                        className="bg-slate-700 text-white text-xs border-none focus:ring-0 w-24 md:w-32 cursor-pointer outline-none py-1.5"
                      >
                        <option value="" disabled>Load...</option>
                        {savedProjects.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                   </div>
                </div>
              </div>

              {/* Settings & Export */}
              <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                 <div className="flex items-center gap-2 text-sm bg-slate-800 px-3 py-1.5 rounded-md border border-slate-700">
                    <span className="text-slate-400 whitespace-nowrap">Margin:</span>
                    <input 
                      type="number" 
                      value={marginPercent} 
                      onChange={(e) => setMarginPercent(parseFloat(e.target.value) || 0)}
                      className="w-10 bg-slate-700 border-none text-white text-center rounded focus:ring-1 focus:ring-blue-500 font-mono p-0"
                    />
                    <span className="text-slate-400">%</span>
                 </div>
                 
                 <button 
                  onClick={handleExportPdf}
                  disabled={isExporting}
                  data-html2canvas-ignore="true"
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-md text-sm font-medium transition disabled:opacity-50 whitespace-nowrap"
                 >
                   {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                   {isExporting ? "..." : "PDF"}
                 </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Inputs */}
        <div className="lg:col-span-4 space-y-5">
          {/* Generator */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="flex items-center gap-2 font-semibold text-slate-700 mb-4 pb-2 border-b">
              <Activity className="w-5 h-5 text-blue-600" /> Generator Data
            </h2>
            <div className="space-y-4">
              <InputGroup label="Rated MVA" value={genData.mva} unit="MVA" onChange={(v) => setGenData({...genData, mva: v})} />
              <InputGroup label="Rated Voltage" value={genData.voltageKv} unit="kV" onChange={(v) => setGenData({...genData, voltageKv: v})} />
              <InputGroup label="Xd'' (Subtransient)" value={genData.subtransientReactanceXd} unit="%" step={0.1} onChange={(v) => setGenData({...genData, subtransientReactanceXd: v})} />
              <InputGroup label="X/R Ratio (Ta)" value={genData.xrRatio} unit="" onChange={(v) => setGenData({...genData, xrRatio: v})} />
            </div>
          </div>

          {/* GSU & UAT */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="flex items-center gap-2 font-semibold text-slate-700 mb-4 pb-2 border-b">
              <Server className="w-5 h-5 text-blue-600" /> Transformers
            </h2>
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-400 uppercase">GSU Transformer</div>
              <div className="grid grid-cols-2 gap-3">
                <InputGroup label="MVA" value={gsuData.mva} unit="MVA" onChange={(v) => setGsuData({...gsuData, mva: v})} />
                <InputGroup label="Imp Z%" value={gsuData.impedanceZ} unit="%" step={0.1} onChange={(v) => setGsuData({...gsuData, impedanceZ: v})} />
                <InputGroup label="X/R" value={gsuData.xrRatio} unit="" onChange={(v) => setGsuData({...gsuData, xrRatio: v})} />
                <InputGroup label="Grid kV" value={gsuData.primaryVoltageKv} unit="kV" onChange={(v) => setGsuData({...gsuData, primaryVoltageKv: v})} />
              </div>
              
              <div className="text-xs font-bold text-slate-400 uppercase pt-2 border-t border-slate-100">Unit Auxiliary (UAT)</div>
              <div className="grid grid-cols-2 gap-3">
                <InputGroup label="MVA" value={uatData.mva} unit="MVA" onChange={(v) => setUatData({...uatData, mva: v})} />
                <InputGroup label="Imp Z%" value={uatData.impedanceZ} unit="%" step={0.1} onChange={(v) => setUatData({...uatData, impedanceZ: v})} />
              </div>
            </div>
          </div>

          {/* System */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="flex items-center gap-2 font-semibold text-slate-700 mb-4 pb-2 border-b">
              <Settings className="w-5 h-5 text-blue-600" /> System & Breaker
            </h2>
            <div className="space-y-4">
              <InputGroup label="Grid SC Capacity" value={sysData.shortCircuitCapacityMva} unit="MVA" onChange={(v) => setSysData({...sysData, shortCircuitCapacityMva: v})} />
              <InputGroup label="System X/R" value={sysData.xrRatio} unit="" onChange={(v) => setSysData({...sysData, xrRatio: v})} />
              <div className="pt-2 border-t border-slate-100">
                <InputGroup label="Contact Parting Time" value={partingTime} unit="ms" onChange={setPartingTime} 
                  helper="Typical: 30-60ms"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Results & Visualization */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Main Sizing Table */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
             <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2">
                   <CheckCircle className="w-5 h-5 text-green-400" /> GCB Rating Selection
                </h3>
                <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">Margin Applied: {marginPercent}%</span>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                 <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                   <tr>
                     <th className="px-6 py-3 font-semibold">Parameter</th>
                     <th className="px-6 py-3">Calculated</th>
                     <th className="px-6 py-3 bg-blue-50/50">With Margin</th>
                     <th className="px-6 py-3 font-bold text-indigo-700 bg-indigo-50/50">Selected Rating</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   <tr className="hover:bg-slate-50/50">
                     <td className="px-6 py-4 font-medium text-slate-700">
                       Rated Normal Current
                       <div className="text-xs font-normal text-slate-400">Continuous Carry</div>
                     </td>
                     <td className="px-6 py-4 font-mono">{ratings.continuous.calc.toFixed(0)} A</td>
                     <td className="px-6 py-4 font-mono bg-blue-50/30 font-medium text-blue-700">{ratings.continuous.margin.toFixed(0)} A</td>
                     <td className="px-6 py-4 font-mono bg-indigo-50/30 font-bold text-indigo-700 text-lg">
                       {ratings.continuous.selected} A
                       <div className="text-[10px] text-indigo-400 font-normal">Rounded up (500A)</div>
                     </td>
                   </tr>
                   <tr className="hover:bg-slate-50/50">
                     <td className="px-6 py-4 font-medium text-slate-700">
                       Symmetrical Breaking
                       <div className="text-xs font-normal text-slate-400">Primary Selection Criteria</div>
                     </td>
                     <td className="px-6 py-4 font-mono">{ratings.sym.calc.toFixed(2)} kA</td>
                     <td className="px-6 py-4 font-mono bg-blue-50/30 font-medium text-blue-700">{ratings.sym.margin.toFixed(2)} kA</td>
                     <td className="px-6 py-4 font-mono bg-indigo-50/30 font-bold text-indigo-700 text-lg">{ratings.sym.selected} kA</td>
                   </tr>
                   <tr className="hover:bg-slate-50/50">
                     <td className="px-6 py-4 font-medium text-slate-700">
                       Asymmetrical Breaking
                       <div className="text-xs font-normal text-slate-400">Rated Capacity</div>
                     </td>
                     <td className="px-6 py-4 font-mono">{ratings.asym.calc.toFixed(2)} kA</td>
                     <td className="px-6 py-4 font-mono bg-blue-50/30 font-medium text-blue-700">{ratings.asym.margin.toFixed(2)} kA</td>
                     <td className="px-6 py-4 font-mono bg-indigo-50/30 font-bold text-indigo-700">
                        {typeof ratings.asym.selected === 'number' ? `${ratings.asym.selected.toFixed(1)} kA` : ratings.asym.selected}
                        <div className="text-[10px] text-indigo-400 font-normal">Derived from Sym</div>
                     </td>
                   </tr>
                   <tr className="hover:bg-slate-50/50">
                     <td className="px-6 py-4 font-medium text-slate-700">
                       Closing, Latching & Carry
                       <div className="text-xs font-normal text-slate-400">Peak Making Capacity</div>
                     </td>
                     <td className="px-6 py-4 font-mono">{ratings.peak.calc.toFixed(2)} kA</td>
                     <td className="px-6 py-4 font-mono bg-blue-50/30 font-medium text-blue-700">{ratings.peak.margin.toFixed(2)} kA</td>
                     <td className="px-6 py-4 font-mono bg-indigo-50/30 font-bold text-indigo-700">
                        {typeof ratings.peak.selected === 'number' ? `${ratings.peak.selected.toFixed(1)} kA` : ratings.peak.selected}
                        <div className="text-[10px] text-indigo-400 font-normal">Derived (2.74 factor)</div>
                     </td>
                   </tr>
                 </tbody>
               </table>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Detailed Calc Breakdown */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 text-sm">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                   <Database className="w-4 h-4" /> Source Calculation Breakdown
                </h3>
                <div className="space-y-6">
                   <div>
                      <div className="flex justify-between items-center mb-1">
                         <span className="font-semibold text-blue-700">System Source</span>
                         <span className="text-xs bg-slate-100 px-2 rounded">Grid + GSU</span>
                      </div>
                      <div className="grid grid-cols-2 gap-y-1 text-slate-600 pl-2 border-l-2 border-blue-200">
                         <span>Sym: {sysResult.symmetricalCurrentkA} kA</span>
                         <span>DC: {sysResult.dcComponentPercent}%</span>
                         <span>Asym: {sysResult.asymmetricalCurrentkA} kA</span>
                         <span>Peak: {sysResult.peakCurrentkA} kA</span>
                      </div>
                   </div>
                   <div>
                      <div className="flex justify-between items-center mb-1">
                         <span className="font-semibold text-amber-700">Generator Source</span>
                         <span className="text-xs bg-slate-100 px-2 rounded">Gen Internal</span>
                      </div>
                      <div className="grid grid-cols-2 gap-y-1 text-slate-600 pl-2 border-l-2 border-amber-200">
                         <span>Sym: {genResult.symmetricalCurrentkA} kA</span>
                         <span className={genResult.dcComponentPercent > 100 ? "text-red-600 font-bold" : ""}>DC: {genResult.dcComponentPercent}%</span>
                         <span>Asym: {genResult.asymmetricalCurrentkA} kA</span>
                         <span>Peak: {genResult.peakCurrentkA} kA</span>
                      </div>
                      {genResult.currentZerosSkipped && (
                        <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded flex items-center gap-1">
                           <AlertTriangle className="w-3 h-3" /> Delayed Current Zeros detected!
                        </div>
                      )}
                   </div>
                </div>
            </div>

            {/* SLD */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col items-center justify-center">
              <div className="w-full flex justify-between items-center mb-2">
                 <h3 className="font-bold text-slate-700">System Topology</h3>
                 <span className="text-[10px] text-slate-400">Visualization</span>
              </div>
              <SingleLineDiagram />
            </div>
          </div>
          
          {/* Waveform */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h3 className="font-bold text-slate-700 mb-2">Worst Case Waveform (Generator Source)</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="time" label={{ value: 'Time (ms)', position: 'insideBottomRight', offset: -5 }} fontSize={12} />
                    <YAxis label={{ value: 'Current (kA)', angle: -90, position: 'insideLeft' }} fontSize={12}/>
                    <Tooltip contentStyle={{ fontSize: '12px' }} />
                    <ReferenceLine x={partingTime} stroke="red" label="Parting" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="current" stroke="#f59e0b" strokeWidth={2} dot={false} name="Total Current" />
                    <Line type="monotone" dataKey="dc" stroke="#94a3b8" strokeDasharray="5 5" dot={false} name="DC Component" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
          </div>

          {/* AI Assessment */}
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl shadow-sm border border-indigo-100 p-6">
             <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                    <Zap className="w-5 h-5" /> AI Engineering Assessment
                  </h3>
                  <p className="text-sm text-indigo-700 mt-1">
                    Get an analysis based on IEC/IEEE 62271-37-013 logic using the calculated parameters.
                  </p>
                </div>
                <button 
                  onClick={handleAiAnalysis}
                  disabled={loadingAi}
                  data-html2canvas-ignore="true"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition flex items-center gap-2 disabled:opacity-50"
                >
                  {loadingAi ? 'Analyzing...' : 'Run Assessment'}
                </button>
             </div>
             
             {aiAssessment ? (
               <div className="bg-white p-4 rounded-lg border border-indigo-100 text-sm text-slate-700 prose prose-sm max-w-none">
                 <pre className="whitespace-pre-wrap font-sans">{aiAssessment}</pre>
               </div>
             ) : (
               <div className="bg-white/50 p-4 rounded-lg border border-indigo-50 text-sm text-slate-500 italic text-center">
                 Click the button above to generate a summary of the GCB requirements.
               </div>
             )}
          </div>

        </div>
      </main>
    </div>
  );
};

// --- Helper Components ---

const InputGroup: React.FC<{
  label: string;
  value: number;
  unit: string;
  step?: number;
  helper?: string;
  onChange: (val: number) => void;
}> = ({ label, value, unit, step = 1, helper, onChange }) => (
  <div>
    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 truncate" title={label}>{label}</label>
    <div className="relative">
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full pl-3 pr-9 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-slate-800"
      />
      <span className="absolute right-2 top-1.5 text-slate-400 text-xs pointer-events-none">{unit}</span>
    </div>
    {helper && <p className="text-[10px] text-slate-400 mt-0.5">{helper}</p>}
  </div>
);

export default App;
