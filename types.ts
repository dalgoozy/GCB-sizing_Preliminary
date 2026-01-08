export interface GeneratorData {
  mva: number;
  voltageKv: number; // Rated Voltage
  powerFactor: number;
  subtransientReactanceXd: number; // in % or pu (0.15 = 15%)
  xrRatio: number; // X/R ratio
}

export interface TransformerData {
  mva: number;
  impedanceZ: number; // in %
  xrRatio: number;
  primaryVoltageKv: number; // Grid side
  secondaryVoltageKv: number; // Gen side
}

export interface UatData {
  mva: number;
  impedanceZ: number; // in %
  xrRatio: number;
  secondaryVoltageKv: number;
}

export interface SystemData {
  shortCircuitCapacityMva: number; // System SC capacity at Grid side
  xrRatio: number;
}

export interface CalculationResult {
  source: 'System' | 'Generator';
  symmetricalCurrentkA: number;
  dcComponentPercent: number;
  peakCurrentkA: number;
  asymmetricalCurrentkA: number;
  topOilRise?: number; // Placeholder for thermal
  breakingCapacityRequired: number;
  timeConstantMs: number;
  currentZerosSkipped: boolean;
}

export interface AnalysisResponse {
  summary: string;
  recommendations: string[];
  standardsCompliance: string;
}
