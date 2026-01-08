import { GeneratorData, TransformerData, SystemData, CalculationResult } from '../types';

/**
 * Calculates the System-source fault current seen at the GCB location (between Gen and GSU).
 */
export const calculateSystemSourceFault = (
  gen: GeneratorData,
  gsu: TransformerData,
  sys: SystemData,
  contactPartingTimeMs: number
): CalculationResult => {
  // 1. Convert System SC to Impedance (Per Unit on GSU Base or common base? Let's use Actual Ohms referred to Gen Voltage)
  
  // Gen Side Voltage Base
  const uBase = gsu.secondaryVoltageKv; // kV (usually same as Gen Voltage)
  
  // System Impedance referred to Gen Side
  // Isys_grid_side = S_sys / (sqrt(3) * U_grid)
  // Z_sys_grid = U_grid / (sqrt(3) * Isys_grid_side) = U_grid^2 / S_sys
  // Refer to Gen side: Z_sys_gen = Z_sys_grid * (U_gen / U_grid)^2 = (U_grid^2 / S_sys) * (U_gen/U_grid)^2 = U_gen^2 / S_sys
  const zSysOhms = (Math.pow(uBase, 2)) / sys.shortCircuitCapacityMva;
  
  // GSU Impedance
  // Z_gsu_ohms = (Z% / 100) * (U_gen^2 / S_gsu_mva)
  const zGsuOhms = (gsu.impedanceZ / 100) * (Math.pow(uBase, 2) / gsu.mva);
  
  // Total Impedance (Simplified magnitude addition, assuming predominantly reactive)
  // Ideally vector addition, but for worst case sizing, magnitude summation is conservative enough or we assume purely reactive for Z.
  // Let's do better: Breakdown to R and X.
  
  // System R/X
  const thetaSys = Math.atan(sys.xrRatio);
  const rSys = zSysOhms * Math.cos(thetaSys);
  const xSys = zSysOhms * Math.sin(thetaSys);
  
  // GSU R/X
  const thetaGsu = Math.atan(gsu.xrRatio);
  const rGsu = zGsuOhms * Math.cos(thetaGsu);
  const xGsu = zGsuOhms * Math.sin(thetaGsu);
  
  const rTotal = rSys + rGsu;
  const xTotal = xSys + xGsu;
  const zTotal = Math.sqrt(rTotal * rTotal + xTotal * xTotal);
  
  // Symmetrical Current
  const iSym = uBase / (Math.sqrt(3) * zTotal); // kA
  
  // DC Component Calculation
  // Time constant Ta = X_total / (2 * pi * f * R_total)
  // Assuming 60Hz default, let's provide 50/60 switch later. Defaulting to 60Hz (377 rad/s) or 50Hz (314 rad/s).
  // Standard uses omega = 2*pi*f. Let's assume 60Hz for IEEE context, or 50Hz for IEC. Let's use 50Hz (314.159) as IEC/IEEE 62271 is international.
  const omega = 2 * Math.PI * 60; 
  const tauMs = (xTotal / (omega * rTotal)) * 1000; // in ms
  
  // DC % at contact parting time
  const dcPercent = 100 * Math.exp(-contactPartingTimeMs / tauMs);
  
  // Asymmetrical Current (I_asym = I_sym * sqrt(1 + 2 * (Idc/100)^2)) is one approx, or simply I_sym + I_dc
  // IEC 60909 method for peak: ip = kappa * sqrt(2) * Isym
  // Total Breaking Current Itot = sqrt( Isym^2 + Idc^2 )
  const iDcKiloAmps = Math.sqrt(2) * iSym * (dcPercent / 100);
  const iAsymBreaking = Math.sqrt(Math.pow(iSym, 2) + Math.pow(iDcKiloAmps, 2));
  
  // Peak making current (t=10ms approx)
  const peakFactor = 1.02 + 0.98 * Math.exp(-3 / (sys.xrRatio)); // Approximation formula or standard factor 2.6/2.7
  const iPeak = Math.sqrt(2) * iSym * (1 + Math.exp(-10 / tauMs)); // Rough peak calc at 1/2 cycle

  return {
    source: 'System',
    symmetricalCurrentkA: Number(iSym.toFixed(2)),
    dcComponentPercent: Number(dcPercent.toFixed(2)),
    peakCurrentkA: Number(iPeak.toFixed(2)),
    asymmetricalCurrentkA: Number(iAsymBreaking.toFixed(2)),
    breakingCapacityRequired: Number(iAsymBreaking.toFixed(2)),
    timeConstantMs: Number(tauMs.toFixed(2)),
    currentZerosSkipped: false // Usually not an issue for system source
  };
};

/**
 * Calculates the Generator-source fault current.
 */
export const calculateGeneratorSourceFault = (
  gen: GeneratorData,
  contactPartingTimeMs: number
): CalculationResult => {
  // Base Impedance
  const uBase = gen.voltageKv;
  const sBase = gen.mva;
  const zBase = Math.pow(uBase, 2) / sBase;
  
  // Gen Reactance Ohms
  // Xd'' (subtransient) is used for max initial current
  const xdDoublePrimeOhms = (gen.subtransientReactanceXd / 100) * zBase;
  
  // R_gen
  const rGen = xdDoublePrimeOhms / gen.xrRatio;
  
  const zGen = Math.sqrt(rGen * rGen + xdDoublePrimeOhms * xdDoublePrimeOhms);
  
  // Symmetrical Current
  // I_sym = U_gen / (sqrt(3) * Xd'')
  const iSym = uBase / (Math.sqrt(3) * zGen);
  
  // DC Component
  const omega = 2 * Math.PI * 60;
  const tauMs = (xdDoublePrimeOhms / (omega * rGen)) * 1000;
  
  const dcPercent = 100 * Math.exp(-contactPartingTimeMs / tauMs);
  const iDcKiloAmps = Math.sqrt(2) * iSym * (dcPercent / 100);
  const iAsymBreaking = Math.sqrt(Math.pow(iSym, 2) + Math.pow(iDcKiloAmps, 2));
  
  // Peak
  const iPeak = Math.sqrt(2) * iSym * 2; // Theoretical max without decay
  
  // Check for delayed current zeros
  // If DC% > 100%, current zeros might be skipped.
  const currentZerosSkipped = dcPercent > 100;

  return {
    source: 'Generator',
    symmetricalCurrentkA: Number(iSym.toFixed(2)),
    dcComponentPercent: Number(dcPercent.toFixed(2)),
    peakCurrentkA: Number(iPeak.toFixed(2)),
    asymmetricalCurrentkA: Number(iAsymBreaking.toFixed(2)),
    breakingCapacityRequired: Number(iAsymBreaking.toFixed(2)),
    timeConstantMs: Number(tauMs.toFixed(2)),
    currentZerosSkipped
  };
};

export const generateWaveformData = (iSym: number, tauMs: number, freq: number = 60) => {
  const data = [];
  const omega = 2 * Math.PI * freq;
  // 5 cycles
  const totalTime = 5 * (1000/freq);
  
  for (let t = 0; t <= totalTime; t += 1) { // 1ms steps
    const tSec = t / 1000;
    const ac = Math.sqrt(2) * iSym * Math.sin(omega * tSec);
    const dc = Math.sqrt(2) * iSym * Math.exp(-t / tauMs);
    const total = ac + dc;
    data.push({
      time: t,
      current: total,
      dc: dc,
      envelopePos: dc + Math.sqrt(2) * iSym,
      envelopeNeg: dc - Math.sqrt(2) * iSym
    });
  }
  return data;
};
