
import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, CheckCircle2, AlertTriangle, History, Info, Play, Square, Settings, LayoutGrid, Pipette, X, MousePointer2, Sun, Contrast, Eye, Sparkles, Zap, Waves, SunDim, Share, Smartphone, Download } from 'lucide-react';
import { analyzeGlueApplication, AdvancedProcessingOptions } from './services/geminiService';
import { InspectionResult, InspectionHistoryItem, CameraState } from './types';
import TemplateOverlay from './components/TemplateOverlay';

const SETTINGS_KEY = 'visionglue_pro_settings_v5';

const App: React.FC = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  
  const [cameraState, setCameraState] = useState<CameraState>({
    isActive: false,
    isAnalyzing: false,
    error: null
  });
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [lastResult, setLastResult] = useState<InspectionResult | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Core Settings
  const savedSettings = (() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  })();

  const [brightness, setBrightness] = useState(savedSettings?.brightness ?? 100);
  const [contrast, setContrast] = useState(savedSettings?.contrast ?? 100);
  const [isGrayscale, setIsGrayscale] = useState(savedSettings?.isGrayscale ?? false);
  const [templateWidthMM, setTemplateWidthMM] = useState(savedSettings?.templateWidthMM ?? 40);
  const [templateHeightMM, setTemplateHeightMM] = useState(savedSettings?.templateHeightMM ?? 40);
  const [tolerance, setTolerance] = useState(savedSettings?.tolerance ?? 95);
  const [isSelectingColor, setIsSelectingColor] = useState(false);
  const [referenceColor, setReferenceColor] = useState<{r: number, g: number, b: number} | null>(savedSettings?.referenceColor ?? null);
  const [advOptions, setAdvOptions] = useState<AdvancedProcessingOptions>(savedSettings?.advOptions ?? {
    autoWhiteBalance: true,
    colorSpaceConversion: true,
    noiseReduction: false,
    reflectionDetection: true
  });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const PIXELS_PER_MM = 300 / 40;
  const templateWidthPX = templateWidthMM * PIXELS_PER_MM;
  const templateHeightPX = templateHeightMM * PIXELS_PER_MM;

  const filterString = `brightness(${brightness}%) contrast(${contrast}%) ${isGrayscale ? 'grayscale(100%)' : ''}`;

  // Binding do stream ao elemento de vídeo (Correção de visualização)
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(err => {
        console.error("Erro ao iniciar reprodução automática:", err);
      });
    }
  }, [stream]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);

    const checkStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(!!checkStandalone);

    const checkIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(checkIOS);

    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const startCamera = async (retryMode: 'env' | 'basic' | 'user' = 'env') => {
    try {
      setCameraState(prev => ({ ...prev, error: null, isActive: false }));
      
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: retryMode === 'user' ? 'user' : 'environment',
          width: retryMode === 'basic' ? undefined : { ideal: 1280 },
          height: retryMode === 'basic' ? undefined : { ideal: 720 }
        }
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      setCameraState(prev => ({ ...prev, isActive: true }));
    } catch (err: any) {
      console.error("Erro na câmera:", err);
      if (retryMode === 'env') return startCamera('basic');
      if (retryMode === 'basic') return startCamera('user');
      setCameraState(prev => ({ ...prev, isActive: false, error: "Acesso à câmera negado ou não encontrada." }));
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } else {
      setShowInstallGuide(true);
    }
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current || !cameraState.isActive) return;
    setCameraState(prev => ({ ...prev, isAnalyzing: true }));
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    const targetWidth = 480;
    const scale = video.videoWidth / video.clientWidth;
    const captureWidth = templateWidthPX * scale;
    const captureHeight = templateHeightPX * scale;
    
    canvas.width = targetWidth;
    canvas.height = Math.round(targetWidth * (templateHeightMM / templateWidthMM));
    
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.filter = filterString;
      ctx.drawImage(video, (video.videoWidth - captureWidth) / 2, (video.videoHeight - captureHeight) / 2, captureWidth, captureHeight, 0, 0, canvas.width, canvas.height);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    const base64 = dataUrl.split(',')[1];

    try {
      const result = await analyzeGlueApplication(base64, templateWidthMM, templateHeightMM, tolerance, advOptions, referenceColor || undefined);
      setLastResult(result);
    } catch (err) {
      setCameraState(prev => ({ ...prev, error: "Falha na análise. Verifique a internet." }));
    } finally {
      setCameraState(prev => ({ ...prev, isAnalyzing: false }));
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      brightness, contrast, isGrayscale, templateWidthMM, templateHeightMM, tolerance, advOptions, referenceColor
    }));
    setIsSettingsOpen(false);
  };

  return (
    <div className="flex flex-col h-screen bg-black text-slate-200 overflow-hidden font-sans">
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900/95 border-b border-white/5 z-30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg shadow-lg">
            <LayoutGrid className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-[10px] font-black uppercase tracking-tighter italic leading-tight">VisionGlue<br/><span className="text-blue-500">PRO ENGINE</span></h1>
        </div>

        <div className="flex items-center gap-2">
          {!isStandalone && (
            <button 
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[9px] font-black rounded-full animate-pulse active:scale-95"
            >
              <Download className="w-3 h-3" /> INSTALAR
            </button>
          )}
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 bg-white/5 rounded-full border border-white/10 active:scale-90">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        {cameraState.isActive ? (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className={`h-full w-full object-cover transition-opacity duration-700 ${isSelectingColor ? 'opacity-40' : 'opacity-100'}`} 
              style={{ filter: filterString }} 
            />
            <TemplateOverlay width={templateWidthPX} height={templateHeightPX} label={`${templateWidthMM}x${templateHeightMM}mm`} />
            
            {lastResult && !cameraState.isAnalyzing && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[92%] max-w-sm z-40 bg-slate-900/90 border border-white/10 p-3 rounded-2xl shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1 rounded-full ${lastResult.status === 'OK' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {lastResult.status === 'OK' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    </div>
                    <span className={`text-[10px] font-black italic uppercase ${lastResult.status === 'OK' ? 'text-green-400' : 'text-red-400'}`}>{lastResult.status}</span>
                  </div>
                  <button onClick={() => setLastResult(null)} className="text-slate-500 p-1"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                    <p className="text-[7px] font-black text-slate-500 uppercase">Cobertura</p>
                    <p className="text-sm font-black text-white">{(100 - lastResult.percentual_sem_cola).toFixed(1)}%</p>
                  </div>
                  <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                    <p className="text-[7px] font-black text-slate-500 uppercase">Falha mm²</p>
                    <p className="text-sm font-black text-white">{lastResult.area_sem_cola_mm2.toFixed(1)}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center p-12 bg-slate-900/50 rounded-[3rem] border border-white/5 backdrop-blur-md">
            {cameraState.error ? (
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            ) : (
              <div className="relative mb-6">
                 <Camera className="w-12 h-12 text-blue-500 mx-auto animate-pulse" />
                 <RefreshCw className="w-6 h-6 text-blue-400 absolute top-0 right-0 animate-spin" />
              </div>
            )}
            <p className="text-[10px] font-black uppercase text-slate-400 mb-6 tracking-widest">{cameraState.error || 'Iniciando Sensores...'}</p>
            <button onClick={() => startCamera()} className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-xs active:scale-95 shadow-xl transition-all">REINICIAR CÂMERA</button>
          </div>
        )}

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 w-full justify-center px-6">
          <button
            disabled={!cameraState.isActive || cameraState.isAnalyzing}
            onClick={() => setIsSelectingColor(true)}
            className="p-5 rounded-2xl bg-black/60 text-white border border-white/20 backdrop-blur-md active:scale-90 disabled:opacity-30"
          >
            <Pipette className="w-6 h-6" />
          </button>

          <button
            disabled={!cameraState.isActive || cameraState.isAnalyzing}
            onClick={captureAndAnalyze}
            className={`flex-1 max-w-[260px] flex items-center justify-center gap-3 py-5 rounded-3xl font-black text-xs tracking-[0.2em] transition-all active:scale-95 shadow-2xl ${cameraState.isAnalyzing ? 'bg-slate-800 text-slate-500' : 'bg-white text-black'}`}
          >
            {cameraState.isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {cameraState.isAnalyzing ? 'PROCESSANDO' : 'INSPECIONAR'}
          </button>
        </div>

        {isSelectingColor && (
          <div className="absolute inset-0 bg-blue-600/30 backdrop-blur-[6px] z-50 flex flex-col items-center justify-center p-8 text-center" onClick={() => setIsSelectingColor(false)}>
            <div className="p-8 bg-black/80 rounded-[3rem] border border-white/10 shadow-2xl">
              <Pipette className="w-16 h-16 text-yellow-400 mb-6 animate-bounce mx-auto" />
              <h2 className="text-white font-black text-lg uppercase italic mb-2 tracking-tighter">Calibração de Base</h2>
              <p className="text-xs text-slate-400 max-w-[200px] mx-auto leading-relaxed">Aponte para a superfície da peça <span className="text-white font-bold">SEM COLA</span> e toque na tela para calibrar o detector.</p>
              <button className="mt-8 px-8 py-2 bg-white/10 rounded-full text-[10px] font-bold text-white uppercase tracking-widest">CANCELAR</button>
            </div>
          </div>
        )}
      </main>

      {/* Ajustes e PWA */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/98 backdrop-blur-3xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-8 shrink-0">
            <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">Painel de Controle</h2>
            <button onClick={() => setIsSettingsOpen(false)} className="p-2 bg-white/5 rounded-full"><X className="w-6 h-6" /></button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
            {!isStandalone && (
              <section className="bg-blue-600 p-6 rounded-[2rem] shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <Smartphone className="w-6 h-6 text-white" />
                  <span className="text-xs font-black text-white uppercase italic">Instalação Recomendada</span>
                </div>
                <p className="text-[10px] text-blue-100 mb-4 leading-relaxed">A instalação permite o uso da câmera em tela cheia e reduz a latência de processamento em dispositivos {isIOS ? 'iOS' : 'Android'}.</p>
                <button onClick={handleInstallClick} className="w-full py-4 bg-white text-blue-600 rounded-2xl text-[10px] font-black uppercase active:scale-95 transition-all">
                  ADICIONAR À TELA DE INÍCIO
                </button>
              </section>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[8px] font-black text-slate-500 uppercase mb-3">Tolerância %</p>
                <input type="range" min="80" max="100" value={tolerance} onChange={(e) => setTolerance(parseInt(e.target.value))} className="w-full accent-green-500" />
                <p className="text-center mt-2 font-bold text-xs">{tolerance}%</p>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[8px] font-black text-slate-500 uppercase mb-3">Brilho Vídeo</p>
                <input type="range" min="50" max="150" value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value))} className="w-full accent-blue-500" />
                <p className="text-center mt-2 font-bold text-xs">{brightness}%</p>
              </div>
            </div>

            <section className="bg-white/5 p-5 rounded-2xl border border-white/5">
              <p className="text-[8px] font-black text-slate-500 uppercase mb-4 tracking-[0.2em]">Área de Inspeção (mm)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[7px] text-slate-500 uppercase ml-1">Largura</label>
                  <input type="number" value={templateWidthMM} onChange={(e) => setTemplateWidthMM(Number(e.target.value))} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm font-bold focus:border-blue-500 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[7px] text-slate-500 uppercase ml-1">Altura</label>
                  <input type="number" value={templateHeightMM} onChange={(e) => setTemplateHeightMM(Number(e.target.value))} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm font-bold focus:border-blue-500 outline-none" />
                </div>
              </div>
            </section>
          </div>

          <div className="pt-6 mt-auto">
            <button onClick={handleSaveSettings} className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl text-[10px] active:scale-95 uppercase tracking-widest shadow-2xl">SALVAR E APLICAR</button>
          </div>
        </div>
      )}

      {/* Guia de Instalação PWA Customizado */}
      {showInstallGuide && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl" onClick={() => setShowInstallGuide(false)}>
          <div className="bg-slate-900 w-full max-w-xs rounded-[3rem] p-10 border border-white/10 text-center animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl rotate-3">
              {isIOS ? <Smartphone className="w-10 h-10 text-white" /> : <Download className="w-10 h-10 text-white" />}
            </div>
            
            <h3 className="text-lg font-black text-white mb-6 uppercase italic tracking-tighter">
              {isIOS ? 'Instalar no iPhone' : 'Instalar no Android'}
            </h3>
            
            <div className="text-left text-xs text-slate-400 space-y-6 mb-10">
              {isIOS ? (
                <>
                  <p className="flex items-start gap-4">
                    <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">1</span>
                    Toque no botão <Share className="w-4 h-4 inline text-blue-400" /> (Compartilhar) na barra inferior do Safari.
                  </p>
                  <p className="flex items-start gap-4">
                    <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">2</span>
                    Role a lista e selecione <span className="text-white font-bold">"Adicionar à Tela de Início"</span>.
                  </p>
                </>
              ) : (
                <>
                  <p className="flex items-start gap-4">
                    <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">1</span>
                    Toque nos três pontos <span className="font-bold text-white">⋮</span> do Chrome.
                  </p>
                  <p className="flex items-start gap-4">
                    <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">2</span>
                    Selecione <span className="text-white font-bold">"Instalar Aplicativo"</span>.
                  </p>
                </>
              )}
            </div>
            <button onClick={() => setShowInstallGuide(false)} className="w-full py-4 bg-white text-black font-black rounded-2xl text-[10px] uppercase active:scale-95 shadow-xl">ENTENDI</button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {cameraState.error && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 z-50 text-[10px] font-black uppercase border border-white/20">
          <AlertTriangle className="w-4 h-4" /> {cameraState.error}
          <button onClick={() => startCamera()} className="ml-2 bg-black/20 p-1.5 rounded-full"><RefreshCw className="w-3 h-3" /></button>
        </div>
      )}
    </div>
  );
};

export default App;
