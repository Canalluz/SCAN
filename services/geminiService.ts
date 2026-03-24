
import { GoogleGenAI, Type } from "@google/genai";
import { InspectionResult } from "../types";

// Using gemini-3-pro-preview for complex reasoning task (industrial inspection)
const MODEL_NAME = 'gemini-3-pro-preview';

export interface AdvancedProcessingOptions {
  autoWhiteBalance: boolean;
  colorSpaceConversion: boolean;
  noiseReduction: boolean;
  reflectionDetection: boolean;
}

export const analyzeGlueApplication = async (
  imageBase64: string, 
  templateWidth: number,
  templateHeight: number,
  tolerance: number,
  advancedOptions: AdvancedProcessingOptions,
  referenceColor?: { r: number, g: number, b: number }
): Promise<InspectionResult> => {
  // Always initialize GoogleGenAI with a named parameter for the API Key
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const totalArea = templateWidth * templateHeight;

  const colorHint = referenceColor 
    ? `ATENÇÃO TÉCNICA: O usuário selecionou a cor RGB(${referenceColor.r}, ${referenceColor.g}, ${referenceColor.b}) como sendo o SUBSTRATO (a peça nua, SEM COLA). 
       Portanto, qualquer região com esta cor dentro da área delimitada deve ser calculada como ÁREA SEM COLA. 
       A cor que for DIFERENTE desta é a COLA.`
    : "Diferencie a cola do substrato pela textura e cor. Geralmente a cola tem um aspecto mais úmido, brilhante ou uma tonalidade específica sobre a peça.";

  const advancedHints = [
    advancedOptions.autoWhiteBalance ? "- MODO BALANÇO DE BRANCO ATIVO: Ignore variações de temperatura de cor (amarelado/azulado) e foque no contraste relativo." : "",
    advancedOptions.colorSpaceConversion ? "- ESPAÇO DE COR OTIMIZADO: Utilize lógica de Delta-E para separar cores, focando na distinção entre superfícies foscas (peça) e brilho residual (cola)." : "",
    advancedOptions.noiseReduction ? "- REDUÇÃO DE RUÍDO ATIVA: Ignore granulações de ISO alto da câmera; considere apenas manchas contínuas de cola." : "",
    advancedOptions.reflectionDetection ? "- DETECÇÃO DE REFLEXO ATIVA: Specular highlights (brilho branco intenso) devem ser interpretados como reflexos na cola, não como falha de cobertura." : ""
  ].filter(h => h !== "").join("\n");

  const prompt = `Você é um sistema de inspeção de qualidade industrial de alta precisão (DSP Vision Engine).
Sua tarefa é analisar a aplicação de adesivo (cola) em uma superfície retangular de ${templateWidth}x${templateHeight}mm (Área total: ${totalArea}mm²).

${colorHint}

RECURSOS DE PROCESSAMENTO ATIVOS:
${advancedHints}

LÓGICA DE CÁLCULO:
1. Analise toda a área de ${totalArea}mm².
2. Identifique os vazios (regiões onde a peça está exposta sem adesivo).
3. Calcule a área total desses vazios em mm² (area_sem_cola_mm2).
4. O percentual_sem_cola deve ser exatamente (area_sem_cola_mm2 / ${totalArea}) * 100.
5. O percentual de COBERTURA é (100 - percentual_sem_cola).
6. CRITÉRIO DE ACEITAÇÃO: Se o percentual de COBERTURA for MENOR que ${tolerance}%, o status deve ser "FORA DO PADRÃO". Se for MAIOR ou IGUAL a ${tolerance}%, o status é "OK".

IMPORTANTE: Não inverta os valores. A área de ${totalArea}mm² é o seu 100%.

Retorne APENAS o JSON.`;

  try {
    // Correct way to call generateContent with model name and contents
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64,
            },
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            area_sem_cola_mm2: {
              type: Type.NUMBER,
              description: "Área total onde a cola está AUSENTE (em mm²).",
            },
            percentual_sem_cola: {
              type: Type.NUMBER,
              description: "Percentual de área SEM cola (0-100).",
            },
            status: {
              type: Type.STRING,
              description: "OK ou FORA DO PADRÃO baseado no critério de cobertura.",
            },
            mask_visualizacao: {
              type: Type.STRING,
              description: "Breve explicação da localização das falhas detectadas.",
            },
          },
          required: ["area_sem_cola_mm2", "percentual_sem_cola", "status"],
        },
      },
    });

    // Access the text property directly (it's a getter, not a method)
    const resultText = response.text;
    if (!resultText) {
      throw new Error("Resposta vazia do modelo.");
    }

    return JSON.parse(resultText) as InspectionResult;
  } catch (error) {
    console.error("Erro na análise Gemini:", error);
    throw error;
  }
};
