
export interface InspectionResult {
  area_sem_cola_mm2: number;
  percentual_sem_cola: number;
  status: 'OK' | 'FORA DO PADRÃO';
  mask_visualizacao?: string;
}

export interface InspectionHistoryItem extends InspectionResult {
  timestamp: number;
  thumbnail: string;
  templateWidth: number;
  templateHeight: number;
}

export interface CameraState {
  isActive: boolean;
  isAnalyzing: boolean;
  error: string | null;
}
