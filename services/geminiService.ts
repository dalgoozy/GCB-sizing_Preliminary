import { GoogleGenAI } from "@google/genai";
import { CalculationResult, GeneratorData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getEngineeringAssessment = async (
  sysResult: CalculationResult,
  genResult: CalculationResult,
  genData: GeneratorData
) => {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Act as a Senior Power Systems Engineer. Review the following Generator Circuit Breaker (GCB) Sizing calculation results based on IEC/IEEE 62271-37-013.
    
    Data Provided:
    Generator Rating: ${genData.mva} MVA, ${genData.voltageKv} kV, X''d: ${genData.subtransientReactanceXd}%
    
    Calculation Results:
    1. System-Source Fault:
       - Symmetrical: ${sysResult.symmetricalCurrentkA} kA
       - DC Component: ${sysResult.dcComponentPercent}%
       - Asymmetrical: ${sysResult.asymmetricalCurrentkA} kA
       - Time Constant: ${sysResult.timeConstantMs} ms

    2. Generator-Source Fault:
       - Symmetrical: ${genResult.symmetricalCurrentkA} kA
       - DC Component: ${genResult.dcComponentPercent}%
       - Asymmetrical: ${genResult.asymmetricalCurrentkA} kA
       - Time Constant: ${genResult.timeConstantMs} ms
       - Zero Skipping: ${genResult.currentZerosSkipped ? "YES (Critical)" : "No"}

    Task:
    1. Provide a concise technical assessment of the GCB suitability.
    2. Highlight which case (System or Gen source) dictates the rating.
    3. Specifically comment on the "Delayed Current Zero" phenomenon if applicable for the generator source.
    4. Mention standard TRV (Transient Recovery Voltage) class (System-source vs Gen-source) generally expected.
    
    Keep it professional, engineering-focused, and under 200 words. Format with Markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error retrieving AI assessment. Please ensure API key is configured.";
  }
};
