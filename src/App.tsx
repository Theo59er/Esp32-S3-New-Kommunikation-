/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Mic,
  Volume2,
  Wifi,
  Usb,
  Radio,
  FileCode,
  Terminal,
  HardDrive,
  Cloud,
  CheckCircle2,
  Play,
  Square,
  RefreshCw,
  Sliders,
  Layers,
  LogOut,
  Trash2,
  FolderOpen,
  Sparkles,
  Monitor,
  Repeat,
  MicOff,
  Keyboard,
  HelpCircle,
  Pause,
  Tv,
  X,
  Share2
} from 'lucide-react';
import { User } from 'firebase/auth';

import { initAuth, googleSignIn, logout } from './services/firebaseAuth';
import {
  listProjectFiles,
  saveProjectFileToDrive,
  deleteDriveFile,
  downloadDriveFile,
  DriveFileItem,
  ProjectBundle
} from './services/googleDrive';
import {
  CODE_TEMPLATES,
  esp32FirmwareCode,
  pythonStreamerCode,
  pythonLaptopBridgeCode,
  platformIoIni,
  setupGuide
} from './data/codeTemplates';

import { AudioVisualizer } from './components/AudioVisualizer';
import { CodeViewer } from './components/CodeViewer';
import { WebSerialConsole } from './components/WebSerialConsole';
import { HardwareDiagram } from './components/HardwareDiagram';
import { DriveModal } from './components/DriveModal';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'studio' | 'code' | 'serial' | 'wiring' | 'drive'>('studio');

  // Google Auth & Drive State
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState<boolean>(false);
  const [driveStatusMsg, setDriveStatusMsg] = useState<string>('');

  // Confirmation Modal State (MANDATORY per Google Workspace Skill)
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'save' | 'delete';
    title: string;
    description: string;
    itemCount?: number;
    itemList?: string[];
    isProcessing?: boolean;
    targetId?: string;
  }>({
    isOpen: false,
    type: 'save',
    title: '',
    description: '',
    itemList: [],
    isProcessing: false,
  });

  // Hardware & Network Configuration
  const [wifiSsid, setWifiSsid] = useState<string>('MeinWLAN');
  const [wifiPass, setWifiPass] = useState<string>('Passwort123');
  const [espIp, setEspIp] = useState<string>('192.168.1.150');
  const [videoPort, setVideoPort] = useState<number>(5000);
  const [audioInPort, setAudioInPort] = useState<number>(5001);
  const [audioOutPort, setAudioOutPort] = useState<number>(5002);

  // AV Studio State
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [videoSourceType, setVideoSourceType] = useState<'camera' | 'display'>('camera');
  const [resolution, setResolution] = useState<string>('640x480');
  const [targetFps, setTargetFps] = useState<number>(30);
  const [jpegQuality, setJpegQuality] = useState<number>(75);

  const [isMediaActive, setIsMediaActive] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isStreamPaused, setIsStreamPaused] = useState<boolean>(false);
  const [showHotkeyHelp, setShowHotkeyHelp] = useState<boolean>(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  // Floating Hotkey Toast HUD
  const [hotkeyToast, setHotkeyToast] = useState<{
    title: string;
    description: string;
    keyBadge: string;
    type: 'camera' | 'display' | 'mic' | 'pause';
  } | null>(null);

  // Metrics
  const [actualFps, setActualFps] = useState<number>(0);
  const [currentBitrateKbps, setCurrentBitrateKbps] = useState<number>(0);
  const [totalFramesSent, setTotalFramesSent] = useState<number>(0);
  const [speakerReturnVolume, setSpeakerReturnVolume] = useState<number>(80);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState<boolean>(false);

  // Refs for media loop
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamIntervalRef = useRef<any>(null);
  const toastTimeoutRef = useRef<any>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const frameCountRef = useRef<number>(0);
  const bytesSentRef = useRef<number>(0);
  const lastMetricsTimeRef = useRef<number>(Date.now());

  // --- Auth Initialization ---
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        loadDriveFilesList(token);
      },
      () => {
        setUser(null);
        setDriveFiles([]);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch available camera and microphone devices
  useEffect(() => {
    const enumerateMedia = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const vDevices = devices.filter((d) => d.kind === 'videoinput');
        const aDevices = devices.filter((d) => d.kind === 'audioinput');
        setVideoDevices(vDevices);
        setAudioDevices(aDevices);
        if (vDevices.length > 0 && !selectedVideoDevice) setSelectedVideoDevice(vDevices[0].deviceId);
        if (aDevices.length > 0 && !selectedAudioDevice) setSelectedAudioDevice(aDevices[0].deviceId);
      } catch (err) {
        console.warn('Media devices enumeration error:', err);
      }
    };
    enumerateMedia();
  }, []);

  // Trigger floating on-screen HUD toast
  const triggerToast = (
    title: string,
    description: string,
    keyBadge: string,
    type: 'camera' | 'display' | 'mic' | 'pause'
  ) => {
    setHotkeyToast({ title, description, keyBadge, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setHotkeyToast(null);
    }, 2500);
  };

  // --- SOURCE SWITCHING FUNCTIONS ---
  const switchToCameraByIndex = async (index: number) => {
    if (index >= 0 && index < videoDevices.length) {
      const dev = videoDevices[index];
      await switchToCamera(dev.deviceId, dev.label || `Kamera ${index + 1}`, `[${index + 1}]`);
    }
  };

  const switchToCamera = async (deviceId: string, label?: string, keyBadge: string = '[C]') => {
    try {
      if (displayStreamRef.current) {
        displayStreamRef.current.getTracks().forEach((t) => t.stop());
        displayStreamRef.current = null;
      }

      setSelectedVideoDevice(deviceId);
      setVideoSourceType('camera');

      const [w, h] = resolution.split('x').map(Number);
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: w }, height: { ideal: h } },
        audio: selectedAudioDevice
          ? { deviceId: { exact: selectedAudioDevice }, echoCancellation: true, noiseSuppression: true }
          : true,
      });

      // Retain mic mute status
      if (isMicMuted) {
        newStream.getAudioTracks().forEach((t) => (t.enabled = false));
      }

      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
      }
      setMediaStream(newStream);
      setIsMediaActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(() => {});
      }

      const camName = label || videoDevices.find((d) => d.deviceId === deviceId)?.label || `Kamera`;
      triggerToast('Kamera gewechselt', camName, keyBadge, 'camera');
    } catch (err: any) {
      console.warn('Switch camera error:', err);
      alert(`Kamera konnte nicht gewechselt werden: ${err.message || err}`);
    }
  };

  const switchToDisplay = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert('Bildschirmübertragung (DisplayMedia) wird von diesem Browser nicht unterstützt.');
      return;
    }

    try {
      const dispStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      displayStreamRef.current = dispStream;
      setVideoSourceType('display');

      // Auto revert to camera when user clicks browser's native "Stop Sharing"
      dispStream.getVideoTracks()[0].onended = () => {
        if (videoDevices.length > 0) {
          switchToCamera(videoDevices[0].deviceId, videoDevices[0].label, '[Auto]');
        } else {
          setVideoSourceType('camera');
        }
      };

      if (videoRef.current) {
        videoRef.current.srcObject = dispStream;
        videoRef.current.play().catch(() => {});
      }

      setIsMediaActive(true);
      triggerToast('Bildschirmübertragung aktiv', 'Desktop / Anwendungsfenster wird an den ESP32 gestreamt', '[D]', 'display');
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        alert(`Bildschirmübertragung fehlgeschlagen: ${err.message || err}`);
      }
    }
  };

  const cycleNextCamera = async () => {
    if (videoDevices.length === 0) return;
    if (videoSourceType === 'display') {
      await switchToCameraByIndex(0);
      return;
    }
    const currentIndex = videoDevices.findIndex((d) => d.deviceId === selectedVideoDevice);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    await switchToCameraByIndex(nextIndex);
  };

  const toggleMicMute = () => {
    const nextMuted = !isMicMuted;
    setIsMicMuted(nextMuted);

    if (mediaStream) {
      mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    triggerToast(
      nextMuted ? 'Mikrofon stummgeschaltet' : 'Mikrofon aktiviert',
      nextMuted ? 'Kein Ton wird an Laptop gesendet' : 'Tonübertragung zum Laptop aktiv',
      '[M]',
      'mic'
    );
  };

  const togglePauseStream = () => {
    const nextPaused = !isStreamPaused;
    setIsStreamPaused(nextPaused);
    triggerToast(
      nextPaused ? 'Stream pausiert' : 'Stream fortgesetzt',
      nextPaused ? 'Bildübertragung angehalten' : 'Live-Frames werden gesendet',
      '[LEERTASTE]',
      'pause'
    );
  };

  // --- GLOBAL KEYBOARD HOTKEY LISTENER ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input, textarea or dropdown
      const target = e.target as HTMLElement;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const key = e.key.toUpperCase();

      // Number keys 1-9: Direct camera selection
      if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        const idx = parseInt(e.key) - 1;
        if (idx < videoDevices.length) {
          e.preventDefault();
          switchToCameraByIndex(idx);
        }
      } else if (key === 'D' || key === 'S' || key === 'B') {
        // D = Display, S = Screen, B = Bildschirm
        e.preventDefault();
        if (videoSourceType === 'display') {
          // Toggle back to camera
          if (videoDevices.length > 0) {
            switchToCamera(selectedVideoDevice || videoDevices[0].deviceId);
          }
        } else {
          switchToDisplay();
        }
      } else if (key === 'C') {
        // C = Cycle camera
        e.preventDefault();
        cycleNextCamera();
      } else if (key === 'M') {
        // M = Mute microphone
        e.preventDefault();
        toggleMicMute();
      } else if (e.code === 'Space') {
        // Space = Pause / Resume
        e.preventDefault();
        togglePauseStream();
      } else if (key === 'H' || key === '?') {
        // H = Help
        e.preventDefault();
        setShowHotkeyHelp((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoDevices, selectedVideoDevice, videoSourceType, isMediaActive, mediaStream, isMicMuted, isStreamPaused]);

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        loadDriveFilesList(res.accessToken);
        setDriveStatusMsg('Erfolgreich mit Google Drive verbunden!');
        setTimeout(() => setDriveStatusMsg(''), 4000);
      }
    } catch (err: any) {
      console.error('Google Sign In failed:', err);
      alert(`Anmeldung fehlgeschlagen: ${err.message || 'Unbekannter Fehler'}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setDriveFiles([]);
  };

  const loadDriveFilesList = async (token?: string) => {
    setIsLoadingDrive(true);
    try {
      const files = await listProjectFiles();
      setDriveFiles(files);
    } catch (err) {
      console.warn('Google Drive Abruffehler:', err);
    } finally {
      setIsLoadingDrive(false);
    }
  };

  // --- Start / Stop Local Camera & Microphone ---
  const handleToggleMedia = async () => {
    if (isMediaActive) {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        setMediaStream(null);
      }
      if (displayStreamRef.current) {
        displayStreamRef.current.getTracks().forEach((track) => track.stop());
        displayStreamRef.current = null;
      }
      if (isStreaming) {
        handleStopStreaming();
      }
      setIsMediaActive(false);
    } else {
      try {
        const [w, h] = resolution.split('x').map(Number);
        const constraints: MediaStreamConstraints = {
          video: selectedVideoDevice
            ? { deviceId: { exact: selectedVideoDevice }, width: { ideal: w }, height: { ideal: h } }
            : { width: { ideal: w }, height: { ideal: h } },
          audio: selectedAudioDevice
            ? { deviceId: { exact: selectedAudioDevice }, echoCancellation: true, noiseSuppression: true }
            : true,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setMediaStream(stream);
        setIsMediaActive(true);
        setVideoSourceType('camera');

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        alert(`Kamera/Mikrofon Zugriff fehlgeschlagen: ${err.message || err}`);
      }
    }
  };

  // --- Start / Stop Wireless Stream Simulation ---
  const handleStartStreaming = () => {
    if (!isMediaActive || !videoRef.current) {
      alert('Bitte starte zuerst die PC-Kamera oder die Bildschirmübertragung!');
      return;
    }

    setIsStreaming(true);
    frameCountRef.current = 0;
    bytesSentRef.current = 0;
    lastMetricsTimeRef.current = Date.now();

    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d');
    const [w, h] = resolution.split('x').map(Number);
    canvas.width = w;
    canvas.height = h;

    const intervalMs = Math.round(1000 / targetFps);

    streamIntervalRef.current = setInterval(() => {
      if (!videoRef.current || !ctx) return;

      // Skip frame generation if user paused the stream via Space key
      if (isStreamPaused) {
        return;
      }

      try {
        ctx.drawImage(videoRef.current, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              frameCountRef.current++;
              bytesSentRef.current += blob.size;
              setTotalFramesSent(frameCountRef.current);
            }
          },
          'image/jpeg',
          jpegQuality / 100
        );

        const now = Date.now();
        const elapsed = (now - lastMetricsTimeRef.current) / 1000;
        if (elapsed >= 1.0) {
          setActualFps(Math.round(frameCountRef.current / elapsed));
          setCurrentBitrateKbps(Math.round((bytesSentRef.current * 8) / (elapsed * 1024)));
          frameCountRef.current = 0;
          bytesSentRef.current = 0;
          lastMetricsTimeRef.current = now;
        }
      } catch (e) {
        console.warn('Stream pump error:', e);
      }
    }, intervalMs);
  };

  const handleStopStreaming = () => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    setIsStreaming(false);
    setActualFps(0);
    setCurrentBitrateKbps(0);
  };

  // --- Drive Operations with Mandatory Confirmation Modals ---
  const promptSaveToDrive = () => {
    if (!user) {
      handleGoogleSignIn();
      return;
    }

    const filesToSave = [
      'esp32_s3_composite_av.ino (C++ Firmware)',
      'pc_av_streamer.py (Python PC Streamer)',
      'laptop_bridge.py (Alternative Receiver)',
      'platformio.ini (Build Config)',
      'README_SETUP.md (Werkstatt-Dokumentation)',
      'project_config.json (Netzwerk & AV Parameter)'
    ];

    setModalConfig({
      isOpen: true,
      type: 'save',
      title: 'Projekt-Bundle in Google Drive sichern',
      description:
        'Dies sichert den kompletten Quellcode für ESP32-S3 und Python inklusive aller Netzwerkeinstellungen und Hotkey-Optionen direkt in deinem persönlichen Google Drive Speicher mit Berechtigung.',
      itemCount: filesToSave.length,
      itemList: filesToSave,
      isProcessing: false,
    });
  };

  const executeSaveToDrive = async () => {
    setModalConfig((prev) => ({ ...prev, isProcessing: true }));
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `ESP32_AV_Bundle_${timestamp}.json`;

      const bundleData: ProjectBundle = {
        title: 'ESP32-S3 Wireless AV Bridge Project',
        timestamp: new Date().toISOString(),
        firmwareCode: esp32FirmwareCode
          .replace(/YOUR_WIFI_SSID/g, wifiSsid)
          .replace(/YOUR_WIFI_PASSWORD/g, wifiPass)
          .replace(/const int VIDEO_UDP_PORT = \d+;/g, `const int VIDEO_UDP_PORT = ${videoPort};`)
          .replace(/const int AUDIO_IN_UDP_PORT = \d+;/g, `const int AUDIO_IN_UDP_PORT = ${audioInPort};`)
          .replace(/const int AUDIO_OUT_UDP_PORT = \d+;/g, `const int AUDIO_OUT_UDP_PORT = ${audioOutPort};`),
        pythonStreamerCode: pythonStreamerCode
          .replace(/DEFAULT_ESP_IP = "[^"]*"/g, `DEFAULT_ESP_IP = "${espIp}"`)
          .replace(/VIDEO_PORT = \d+/g, `VIDEO_PORT = ${videoPort}`)
          .replace(/AUDIO_IN_PORT = \d+/g, `AUDIO_IN_PORT = ${audioInPort}`)
          .replace(/AUDIO_OUT_PORT = \d+/g, `AUDIO_OUT_PORT = ${audioOutPort}`),
        pythonBridgeCode: pythonLaptopBridgeCode,
        platformIoIni,
        setupGuide,
        settings: {
          espIp,
          videoPort,
          audioPort: audioInPort,
          resolution,
          fps: targetFps,
          audioSampleRate: 16000,
          wifiSsid,
          enableSpeakerReturn: true,
        },
      };

      await saveProjectFileToDrive(filename, JSON.stringify(bundleData, null, 2), 'application/json');

      setDriveStatusMsg(`"${filename}" erfolgreich in Google Drive gespeichert!`);
      setTimeout(() => setDriveStatusMsg(''), 5000);
      setModalConfig((prev) => ({ ...prev, isOpen: false, isProcessing: false }));
      loadDriveFilesList();
    } catch (err: any) {
      alert(`Speichern fehlgeschlagen: ${err.message || err}`);
      setModalConfig((prev) => ({ ...prev, isProcessing: false }));
    }
  };

  const promptDeleteDriveFile = (file: DriveFileItem) => {
    setModalConfig({
      isOpen: true,
      type: 'delete',
      title: `Datei aus Google Drive entfernen?`,
      description: `Möchtest du "${file.name}" wirklich dauerhaft aus deinem Google Drive löschen?`,
      itemList: [file.name],
      targetId: file.id,
      isProcessing: false,
    });
  };

  const executeDeleteDriveFile = async () => {
    if (!modalConfig.targetId) return;
    setModalConfig((prev) => ({ ...prev, isProcessing: true }));
    try {
      await deleteDriveFile(modalConfig.targetId);
      setDriveStatusMsg(`Datei wurde gelöscht.`);
      setTimeout(() => setDriveStatusMsg(''), 4000);
      setModalConfig((prev) => ({ ...prev, isOpen: false, isProcessing: false }));
      loadDriveFilesList();
    } catch (err: any) {
      alert(`Löschen fehlgeschlagen: ${err.message || err}`);
      setModalConfig((prev) => ({ ...prev, isProcessing: false }));
    }
  };

  const handleDownloadDriveFile = async (file: DriveFileItem) => {
    try {
      const content = await downloadDriveFile(file.id);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Download fehlgeschlagen: ${err.message || err}`);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#07040d] text-slate-100 flex flex-col font-sans overflow-x-hidden selection:bg-rose-500 selection:text-white">
      {/* ================= MOVING BLURRED GALAXY BACKGROUND (RED, PURPLE, PINK) ================= */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Deep Crimson Nebula Orb */}
        <div className="absolute -top-32 -left-32 w-[650px] h-[650px] rounded-full bg-gradient-to-br from-rose-700/35 via-red-600/25 to-pink-700/20 blur-[130px] animate-nebula-1" />

        {/* Electric Purple/Violet Nebula Orb */}
        <div className="absolute top-1/4 -right-40 w-[750px] h-[750px] rounded-full bg-gradient-to-tl from-purple-800/40 via-indigo-900/30 to-fuchsia-700/25 blur-[150px] animate-nebula-2" />

        {/* Hot Pink / Magenta Nebula Orb */}
        <div className="absolute -bottom-48 left-1/3 w-[700px] h-[700px] rounded-full bg-gradient-to-tr from-pink-600/30 via-rose-600/25 to-purple-800/35 blur-[140px] animate-nebula-3" />

        {/* Center Pulsing Cosmic Core */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full bg-radial from-fuchsia-600/10 via-purple-900/15 to-transparent blur-[120px] animate-galaxy-pulse" />

        {/* Subtle Cosmic Stardust Mesh Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0)_0%,rgba(7,4,13,0.6)_100%)] pointer-events-none" />
      </div>

      {/* Content wrapper with relative positioning above galaxy */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top Application Bar */}
        <header className="border-b border-purple-900/40 bg-slate-950/70 backdrop-blur-xl sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 via-purple-600 to-pink-500 p-0.5 shadow-lg shadow-purple-950/50">
                <div className="w-full h-full bg-[#0d0718] rounded-[10px] flex items-center justify-center">
                  <Radio className="w-5 h-5 text-rose-400" />
                </div>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-base font-bold text-white tracking-tight flex items-center space-x-1.5">
                    <span>ESP32-S3 Wireless AV Bridge</span>
                    <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                  </h1>
                  <span className="text-[10px] font-mono uppercase bg-rose-950/70 text-rose-300 border border-rose-700/50 px-2 py-0.5 rounded-full font-bold shadow-sm shadow-rose-950/50">
                    UVC + UAC Composite
                  </span>
                </div>
                <p className="text-xs text-rose-200/60">
                  Webcam, Display &amp; Mikrofon direkt vom PC drahtlos auf den ESP32-S3
                </p>
              </div>
            </div>

            {/* User & Cloud Actions */}
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowHotkeyHelp(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 text-pink-300 border border-purple-500/30 text-xs font-semibold transition"
                title="Tastatur-Hotkeys Übersicht"
              >
                <Keyboard className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden md:inline">Hotkeys [1-9, D, C, M]</span>
              </button>

              {user ? (
                <div className="flex items-center space-x-3 bg-purple-950/50 px-3 py-1.5 rounded-xl border border-purple-500/30 backdrop-blur-md">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      className="w-7 h-7 rounded-full border border-pink-400/50"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-rose-600 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                      {user.email?.[0].toUpperCase()}
                    </div>
                  )}
                  <div className="hidden sm:block text-left">
                    <div className="text-xs font-semibold text-rose-100 truncate max-w-[130px]">
                      {user.displayName || user.email?.split('@')[0]}
                    </div>
                    <div className="text-[10px] text-pink-400 font-mono">Google Drive Verbunden</div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 rounded-lg transition"
                    title="Abmelden"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                /* Official Google Sign In Button */
                <button
                  onClick={handleGoogleSignIn}
                  disabled={isLoggingIn}
                  className="flex items-center space-x-2.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs transition shadow-md hover:shadow-lg disabled:opacity-50"
                >
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>{isLoggingIn ? 'Verbinde...' : 'Mit Google anmelden'}</span>
                </button>
              )}

              <button
                onClick={promptSaveToDrive}
                className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-rose-500 via-purple-600 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white font-bold rounded-xl text-xs shadow-lg shadow-purple-900/40 transition"
                title="Projektpaket in Google Drive speichern"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>In Drive sichern</span>
              </button>
            </div>
          </div>

          {/* Global Notification Banner */}
          {driveStatusMsg && (
            <div className="bg-gradient-to-r from-rose-950/90 via-purple-950/90 to-pink-950/90 border-t border-purple-500/40 px-4 py-1.5 text-xs text-pink-200 font-mono flex items-center justify-center space-x-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-pink-400" />
              <span>{driveStatusMsg}</span>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 border-t border-purple-900/30 overflow-x-auto">
            {[
              { id: 'studio', label: 'AV Studio & Streamer', icon: Camera },
              { id: 'code', label: 'Quellcode & Firmware', icon: FileCode },
              { id: 'serial', label: 'Web-Serial Konsole', icon: Terminal },
              { id: 'wiring', label: 'Architektur & Verdrahtung', icon: Layers },
              { id: 'drive', label: 'Google Drive Dateien', icon: HardDrive },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 py-3 px-4 border-b-2 text-xs font-semibold whitespace-nowrap transition ${
                    isActive
                      ? 'border-pink-500 text-pink-300 bg-pink-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-purple-800'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-pink-400' : ''}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* ================= TAB 1: AV STUDIO & STREAMER ================= */}
          {activeTab === 'studio' && (
            <div className="space-y-6">
              {/* Quick Status Hero */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-900/80 border border-purple-500/25 rounded-2xl p-4 flex items-center space-x-3 shadow-lg shadow-purple-950/30 backdrop-blur-xl">
                  <div className={`p-2.5 rounded-xl ${isMediaActive ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-800 text-slate-500'}`}>
                    {videoSourceType === 'display' ? <Monitor className="w-5 h-5 text-pink-400" /> : <Camera className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="text-[11px] text-rose-300/70 uppercase font-mono">
                      {videoSourceType === 'display' ? 'Bildschirm-Übertragung' : 'PC Kamera & Mic'}
                    </div>
                    <div className="text-sm font-bold text-white">
                      {isMediaActive ? (videoSourceType === 'display' ? 'Display aktiv' : 'Webcam aktiv') : 'Kamera Aus'}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-purple-500/25 rounded-2xl p-4 flex items-center space-x-3 shadow-lg shadow-purple-950/30 backdrop-blur-xl">
                  <div className={`p-2.5 rounded-xl ${isStreaming ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' : 'bg-slate-800 text-slate-500'}`}>
                    <Wifi className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-pink-300/70 uppercase font-mono">Drahtloser Stream</div>
                    <div className="text-sm font-bold text-white">
                      {isStreaming ? (isStreamPaused ? 'Pausiert [Space]' : `${actualFps} FPS | ${currentBitrateKbps} kbps`) : 'Stream Inaktiv'}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-purple-500/25 rounded-2xl p-4 flex items-center space-x-3 shadow-lg shadow-purple-950/30 backdrop-blur-xl">
                  <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    <Usb className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-purple-300/70 uppercase font-mono">ESP32 USB-Deskriptor</div>
                    <div className="text-sm font-bold text-white">UVC Cam + UAC Mic/Spk</div>
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-purple-500/25 rounded-2xl p-4 flex items-center space-x-3 shadow-lg shadow-purple-950/30 backdrop-blur-xl">
                  <div className={`p-2.5 rounded-xl ${isMicMuted ? 'bg-rose-950/60 text-rose-400 border border-rose-800' : 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30'}`}>
                    {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="text-[11px] text-fuchsia-300/70 uppercase font-mono">Mikrofon Status [M]</div>
                    <div className="text-sm font-bold text-white">
                      {isMicMuted ? 'Stummgeschaltet' : 'Mikrofon Aktiv'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Studio Workspace: Camera Canvas + Settings */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left / Center: Video Feed & Audio Visualizer (8 cols) */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="bg-slate-900/85 border border-purple-500/30 rounded-2xl p-5 shadow-2xl shadow-purple-950/40 backdrop-blur-xl flex flex-col">
                    {/* Monitor Top Bar */}
                    <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
                      <div className="flex items-center space-x-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${isMediaActive ? (isStreamPaused ? 'bg-amber-400' : 'bg-rose-500 animate-pulse') : 'bg-slate-600'}`} />
                        <span className="font-bold text-sm text-white">
                          {videoSourceType === 'display' ? 'Bildschirm-Übertragung (Display)' : 'PC Kamera-Monitor'}
                        </span>
                        <span className="text-xs font-mono text-pink-300 bg-purple-950/70 border border-purple-800/40 px-2 py-0.5 rounded-md">
                          {resolution} @ {targetFps}fps
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={handleToggleMedia}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition ${
                            isMediaActive
                              ? 'bg-rose-700 hover:bg-rose-600 text-white'
                              : 'bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 text-white shadow-md shadow-rose-950/40'
                          }`}
                        >
                          {isMediaActive ? (
                            <>
                              <Square className="w-3.5 h-3.5" />
                              <span>Stoppen</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5" />
                              <span>Kamera starten</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={isStreaming ? handleStopStreaming : handleStartStreaming}
                          disabled={!isMediaActive}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition disabled:opacity-40 ${
                            isStreaming
                              ? 'bg-amber-600 hover:bg-amber-500 text-white'
                              : 'bg-gradient-to-r from-rose-500 via-purple-600 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white font-extrabold shadow-lg shadow-purple-950/50'
                          }`}
                        >
                          <Wifi className="w-3.5 h-3.5" />
                          <span>{isStreaming ? 'Stream stoppen' : 'Stream zum ESP32'}</span>
                        </button>
                      </div>
                    </div>

                    {/* ================= INTERACTIVE KEYBOARD HOTKEY QUICK-BAR ================= */}
                    <div className="mb-3 bg-slate-950/80 p-2.5 rounded-xl border border-purple-900/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5">
                        <span className="text-[10px] font-mono text-purple-300 font-bold uppercase tracking-wider mr-1">
                          Quellen:
                        </span>

                        {/* Camera index pills (1, 2, 3...) */}
                        {videoDevices.map((cam, idx) => {
                          const isCurrent = videoSourceType === 'camera' && selectedVideoDevice === cam.deviceId;
                          return (
                            <button
                              key={cam.deviceId}
                              onClick={() => switchToCameraByIndex(idx)}
                              className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold flex items-center space-x-1.5 transition ${
                                isCurrent
                                  ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-md shadow-rose-950/50 border border-pink-400'
                                  : 'bg-purple-950/50 hover:bg-purple-900/50 text-slate-300 border border-purple-800/40'
                              }`}
                              title={`Zu Kamera ${idx + 1} wechseln (Taste [${idx + 1}])`}
                            >
                              <span className="px-1 py-0.2 rounded bg-black/40 text-[9px] text-pink-300">
                                {idx + 1}
                              </span>
                              <span className="truncate max-w-[90px]">{cam.label.split(' ')[0] || `Cam ${idx + 1}`}</span>
                            </button>
                          );
                        })}

                        {/* Display / Screen Share Pill [D] */}
                        <button
                          onClick={switchToDisplay}
                          className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold flex items-center space-x-1.5 transition ${
                            videoSourceType === 'display'
                              ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-pink-950/50 border border-pink-300 animate-pulse'
                              : 'bg-purple-950/50 hover:bg-purple-900/50 text-slate-300 border border-purple-800/40'
                          }`}
                          title="Bildschirm / Desktop übertragen (Taste [D] oder [S])"
                        >
                          <span className="px-1 py-0.2 rounded bg-black/40 text-[9px] text-pink-300 font-bold">
                            D
                          </span>
                          <Monitor className="w-3 h-3 text-pink-300" />
                          <span>Bildschirm</span>
                        </button>

                        {/* Cycle next camera [C] */}
                        <button
                          onClick={cycleNextCamera}
                          className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[11px] flex items-center space-x-1 transition"
                          title="Nächste Kamera (Taste [C])"
                        >
                          <span className="px-1 py-0.2 rounded bg-black/40 text-[9px] text-purple-300 font-bold">C</span>
                          <Repeat className="w-3 h-3 text-purple-400" />
                        </button>

                        {/* Mic mute toggle [M] */}
                        <button
                          onClick={toggleMicMute}
                          className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold flex items-center space-x-1 transition ${
                            isMicMuted
                              ? 'bg-rose-600 text-white border border-rose-500'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                          title="Mikrofon stummschalten (Taste [M])"
                        >
                          <span className="px-1 py-0.2 rounded bg-black/40 text-[9px] text-rose-300 font-bold">M</span>
                          {isMicMuted ? <MicOff className="w-3 h-3 text-white" /> : <Mic className="w-3 h-3 text-emerald-400" />}
                          <span>{isMicMuted ? 'Stumm' : 'Mic'}</span>
                        </button>

                        {/* Pause Toggle [Space] */}
                        <button
                          onClick={togglePauseStream}
                          className={`px-2 py-1 rounded-lg font-mono text-[11px] flex items-center space-x-1 transition ${
                            isStreamPaused
                              ? 'bg-amber-600 text-white border border-amber-400'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                          title="Stream pausieren (Leertaste)"
                        >
                          <span className="px-1 py-0.2 rounded bg-black/40 text-[9px] text-amber-300 font-bold">Space</span>
                          {isStreamPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                        </button>
                      </div>

                      <button
                        onClick={() => setShowHotkeyHelp(true)}
                        className="text-pink-400 hover:text-pink-300 p-1 rounded hover:bg-purple-900/40 transition flex items-center space-x-1"
                        title="Tastatur-Hotkeys Hilfe anzeigen"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span className="text-[10px]">Tastenbelegung</span>
                      </button>
                    </div>

                    {/* Video viewport with HUD & Toast */}
                    <div className="relative aspect-video bg-slate-950/90 rounded-xl overflow-hidden border border-purple-900/40 flex items-center justify-center shadow-inner">
                      <video
                        ref={videoRef}
                        muted
                        playsInline
                        className={`w-full h-full object-contain ${!isMediaActive ? 'hidden' : 'block'}`}
                      />

                      {!isMediaActive && (
                        <div className="text-center p-6 text-slate-500">
                          {videoSourceType === 'display' ? (
                            <Monitor className="w-12 h-12 mx-auto mb-2 opacity-30 text-pink-400" />
                          ) : (
                            <Camera className="w-12 h-12 mx-auto mb-2 opacity-30 text-pink-400" />
                          )}
                          <p className="text-sm font-semibold text-rose-200/80">Keine Videoquelle aktiv</p>
                          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                            Klicke oben auf eine Kamera, auf "Bildschirm", oder drücke die Tastatur-Hotkeys [1-9] / [D].
                          </p>
                        </div>
                      )}

                      {/* Floating Hotkey HUD Toast (Animated pop-in) */}
                      {hotkeyToast && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-slate-950/90 backdrop-blur-xl border border-pink-500/60 rounded-2xl px-4 py-2.5 shadow-2xl shadow-pink-950/60 flex items-center space-x-3 animate-fadeIn">
                          <div className="px-2 py-1 rounded-lg bg-pink-500/20 border border-pink-500/40 text-pink-300 font-mono text-xs font-bold">
                            {hotkeyToast.keyBadge}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                              {hotkeyToast.type === 'display' && <Monitor className="w-3.5 h-3.5 text-pink-400" />}
                              {hotkeyToast.type === 'camera' && <Camera className="w-3.5 h-3.5 text-rose-400" />}
                              {hotkeyToast.type === 'mic' && <Mic className="w-3.5 h-3.5 text-purple-400" />}
                              {hotkeyToast.type === 'pause' && <Pause className="w-3.5 h-3.5 text-amber-400" />}
                              <span>{hotkeyToast.title}</span>
                            </div>
                            <div className="text-[11px] text-rose-200/70">{hotkeyToast.description}</div>
                          </div>
                        </div>
                      )}

                      {/* Stream Status Overlay (Top-Left HUD) */}
                      {isStreaming && (
                        <div className="absolute top-3 left-3 bg-slate-950/85 backdrop-blur-md border border-pink-500/50 rounded-xl p-3 font-mono text-xs text-pink-300 space-y-1 shadow-2xl">
                          <div className="flex items-center space-x-2 text-white font-bold">
                            <span className={`w-2 h-2 rounded-full ${isStreamPaused ? 'bg-amber-400' : 'bg-rose-500 animate-ping'}`} />
                            <span>
                              {isStreamPaused ? 'STREAM PAUSIERT [SPACE]' : `SENDE AN ${espIp}:${videoPort}`}
                            </span>
                          </div>
                          <div className="flex justify-between space-x-4 text-[11px]">
                            <span className="text-slate-400">Quelle:</span>
                            <span className="text-pink-300 font-bold uppercase">{videoSourceType}</span>
                          </div>
                          <div className="flex justify-between space-x-4 text-[11px]">
                            <span className="text-slate-400">Aktuelle FPS:</span>
                            <span className="text-rose-400 font-bold">{actualFps}</span>
                          </div>
                          <div className="flex justify-between space-x-4 text-[11px]">
                            <span className="text-slate-400">Bitrate:</span>
                            <span className="text-pink-300 font-bold">{currentBitrateKbps} kbps</span>
                          </div>
                          <div className="flex justify-between space-x-4 text-[11px]">
                            <span className="text-slate-400">Mikrofon:</span>
                            <span className={isMicMuted ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                              {isMicMuted ? 'MUTED [M]' : 'AKTIV'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Audio Visualizer & Waveform Bar */}
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center space-x-1.5">
                          {isMicMuted ? <MicOff className="w-3.5 h-3.5 text-rose-500" /> : <Mic className="w-3.5 h-3.5 text-rose-400" />}
                          <span className="text-rose-200/80">
                            Mikrofon-Eingangsspektrum (16kHz 16-Bit PCM) {isMicMuted ? '(Stummgeschaltet)' : ''}
                          </span>
                        </span>
                        <span className="font-mono text-[11px] text-pink-400">
                          {isMediaActive ? (isMicMuted ? 'MUTED [M]' : 'LIVE MIKROFON') : 'INAKTIV'}
                        </span>
                      </div>
                      <AudioVisualizer stream={mediaStream} isActive={isMediaActive && !isMicMuted} />
                    </div>
                  </div>

                  {/* Laptop Return Speaker Channel (Bidirectional Audio) */}
                  <div className="bg-slate-900/85 border border-purple-500/30 rounded-2xl p-5 shadow-2xl shadow-purple-950/40 backdrop-blur-xl">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <Volume2 className="w-5 h-5 text-purple-400" />
                        <div>
                          <h4 className="text-sm font-bold text-white">Laptop Lautsprecher-Rückkanal (UAC Speaker)</h4>
                          <p className="text-[11px] text-slate-400">
                            Audiosignale des Laptops (z. B. Stimmen aus MS Teams) werden vom ESP32 abgefangen und per WLAN an deinen PC zurückgespielt
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-mono bg-purple-950/80 text-purple-300 border border-purple-800/60 px-2.5 py-1 rounded-lg">
                        UDP Port {audioOutPort}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-slate-950/80 p-3 rounded-xl border border-purple-900/30">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => setIsSpeakerMuted(!isSpeakerMuted)}
                          className={`p-2 rounded-lg border transition ${
                            isSpeakerMuted
                              ? 'bg-rose-950/60 text-rose-400 border-rose-800'
                              : 'bg-purple-950/60 text-purple-300 border-purple-800'
                          }`}
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <div>
                          <div className="text-xs font-semibold text-slate-200">
                            {isSpeakerMuted ? 'Stumm' : `Lautstärke: ${speakerReturnVolume}%`}
                          </div>
                          <div className="text-[10px] text-slate-500">PC Wiedergabe</div>
                        </div>
                      </div>

                      <div className="sm:col-span-2 flex items-center space-x-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={speakerReturnVolume}
                          onChange={(e) => setSpeakerReturnVolume(Number(e.target.value))}
                          disabled={isSpeakerMuted}
                          className="w-full accent-pink-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Studio Settings & Network Routing (4 cols) */}
                <div className="lg:col-span-4 space-y-4">
                  {/* Device & Hotkey Info Box */}
                  <div className="bg-slate-900/85 border border-purple-500/30 rounded-2xl p-5 shadow-2xl shadow-purple-950/40 backdrop-blur-xl space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-purple-900/40">
                      <div className="flex items-center space-x-2">
                        <Keyboard className="w-4 h-4 text-pink-400" />
                        <h3 className="text-sm font-bold text-white">Tastatur-Hotkeys</h3>
                      </div>
                      <span className="text-[10px] text-purple-300 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                        Echtzeit aktiv
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-purple-900/30">
                        <span className="text-slate-300">Kamera 1 bis 9 direkt wählen</span>
                        <kbd className="px-2 py-0.5 rounded bg-purple-950 border border-purple-700 text-pink-300 font-mono text-[11px] font-bold">
                          [ 1 ] - [ 9 ]
                        </kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-purple-900/30">
                        <span className="text-slate-300">Bildschirm / Display teilen</span>
                        <kbd className="px-2 py-0.5 rounded bg-purple-950 border border-purple-700 text-pink-300 font-mono text-[11px] font-bold">
                          [ D ] / [ S ]
                        </kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-purple-900/30">
                        <span className="text-slate-300">Nächste Kamera durchschalten</span>
                        <kbd className="px-2 py-0.5 rounded bg-purple-950 border border-purple-700 text-pink-300 font-mono text-[11px] font-bold">
                          [ C ]
                        </kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-purple-900/30">
                        <span className="text-slate-300">Mikrofon Stumm / Aktiv</span>
                        <kbd className="px-2 py-0.5 rounded bg-purple-950 border border-purple-700 text-pink-300 font-mono text-[11px] font-bold">
                          [ M ]
                        </kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-purple-900/30">
                        <span className="text-slate-300">Stream Pause / Fortsetzen</span>
                        <kbd className="px-2 py-0.5 rounded bg-purple-950 border border-purple-700 text-pink-300 font-mono text-[11px] font-bold">
                          [ Space ]
                        </kbd>
                      </div>
                    </div>
                  </div>

                  {/* Device & Compression Controls */}
                  <div className="bg-slate-900/85 border border-purple-500/30 rounded-2xl p-5 shadow-2xl shadow-purple-950/40 backdrop-blur-xl space-y-4">
                    <div className="flex items-center space-x-2 pb-2 border-b border-purple-900/40">
                      <Sliders className="w-4 h-4 text-rose-400" />
                      <h3 className="text-sm font-bold text-white">Stream &amp; Aufnahme-Einstellungen</h3>
                    </div>

                    {/* Camera Selector */}
                    <div>
                      <label className="text-rose-200/80 text-xs font-semibold block mb-1.5">
                        Aktive Kamera
                      </label>
                      <select
                        value={selectedVideoDevice}
                        onChange={(e) => switchToCamera(e.target.value)}
                        className="w-full bg-slate-950/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-sans"
                      >
                        {videoDevices.length === 0 ? (
                          <option value="">Standard-Webcam</option>
                        ) : (
                          videoDevices.map((d, idx) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              [{idx + 1}] {d.label || `Kamera ${idx + 1}`}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    {/* Microphone Selector */}
                    <div>
                      <label className="text-rose-200/80 text-xs font-semibold block mb-1.5">
                        Mikrofoneingang
                      </label>
                      <select
                        value={selectedAudioDevice}
                        onChange={(e) => setSelectedAudioDevice(e.target.value)}
                        disabled={isMediaActive}
                        className="w-full bg-slate-950/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-sans disabled:opacity-60"
                      >
                        {audioDevices.length === 0 ? (
                          <option value="">Standard-Mikrofon</option>
                        ) : (
                          audioDevices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label || `Mikrofon (${d.deviceId.slice(0, 8)})`}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    {/* Resolution & FPS */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 text-[11px] font-semibold block mb-1">
                          Auflösung
                        </label>
                        <select
                          value={resolution}
                          onChange={(e) => setResolution(e.target.value)}
                          disabled={isMediaActive}
                          className="w-full bg-slate-950/90 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-mono disabled:opacity-60"
                        >
                          <option value="320x240">320x240 (Sehr schnell)</option>
                          <option value="640x480">640x480 (Empfohlen)</option>
                          <option value="1280x720">1280x720 (HD 720p)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-slate-400 text-[11px] font-semibold block mb-1">
                          Bildrate (FPS)
                        </label>
                        <select
                          value={targetFps}
                          onChange={(e) => setTargetFps(Number(e.target.value))}
                          disabled={isStreaming}
                          className="w-full bg-slate-950/90 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-mono disabled:opacity-60"
                        >
                          <option value={15}>15 FPS (Niedrige Last)</option>
                          <option value={24}>24 FPS (Flüssig)</option>
                          <option value={30}>30 FPS (Standard)</option>
                        </select>
                      </div>
                    </div>

                    {/* JPEG Compression Quality */}
                    <div>
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>JPEG-Qualität: {jpegQuality}%</span>
                        <span className="text-[11px] text-pink-400 font-mono">
                          {jpegQuality > 80 ? 'Hohe Details' : 'Geringe Latenz'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="30"
                        max="95"
                        value={jpegQuality}
                        onChange={(e) => setJpegQuality(Number(e.target.value))}
                        className="w-full accent-pink-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Target ESP32 Network Settings */}
                  <div className="bg-slate-900/85 border border-purple-500/30 rounded-2xl p-5 shadow-2xl shadow-purple-950/40 backdrop-blur-xl space-y-4">
                    <div className="flex items-center space-x-2 pb-2 border-b border-purple-900/40">
                      <Wifi className="w-4 h-4 text-pink-400" />
                      <h3 className="text-sm font-bold text-white">ESP32-S3 Ziel-Netzwerk</h3>
                    </div>

                    <div>
                      <label className="text-rose-200/80 text-xs font-semibold block mb-1">
                        ESP32 IP-Adresse
                      </label>
                      <input
                        type="text"
                        value={espIp}
                        onChange={(e) => setEspIp(e.target.value)}
                        placeholder="192.168.1.150"
                        className="w-full bg-slate-950/90 border border-slate-700 focus:border-rose-500 rounded-xl px-3 py-2 text-xs text-pink-300 font-mono focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-slate-400 text-[10px] uppercase font-mono block mb-1">
                          Video Port
                        </label>
                        <input
                          type="number"
                          value={videoPort}
                          onChange={(e) => setVideoPort(Number(e.target.value) || 5000)}
                          className="w-full bg-slate-950/90 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-[10px] uppercase font-mono block mb-1">
                          Mic Port
                        </label>
                        <input
                          type="number"
                          value={audioInPort}
                          onChange={(e) => setAudioInPort(Number(e.target.value) || 5001)}
                          className="w-full bg-slate-950/90 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 text-[10px] uppercase font-mono block mb-1">
                          Spk Port
                        </label>
                        <input
                          type="number"
                          value={audioOutPort}
                          onChange={(e) => setAudioOutPort(Number(e.target.value) || 5002)}
                          className="w-full bg-slate-950/90 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: SOURCE CODE & FIRMWARE ================= */}
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/85 p-4 rounded-2xl border border-purple-500/30 backdrop-blur-xl">
                <div>
                  <h2 className="text-base font-bold text-white">Firmware &amp; Skript Generator</h2>
                  <p className="text-xs text-slate-400">
                    Flashbereite ESP32-S3 Arduino/PlatformIO Firmware und Python-Begleitprogramme.
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={promptSaveToDrive}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-500 via-purple-600 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white flex items-center space-x-2 transition shadow-lg shadow-purple-900/40"
                  >
                    <Cloud className="w-4 h-4" />
                    <span>Alle Dateien in Google Drive sichern</span>
                  </button>
                </div>
              </div>

              <CodeViewer
                templates={CODE_TEMPLATES}
                wifiSsid={wifiSsid}
                wifiPass={wifiPass}
                espIp={espIp}
                videoPort={videoPort}
                audioInPort={audioInPort}
                audioOutPort={audioOutPort}
                onUpdateWifi={(ssid, pass) => {
                  setWifiSsid(ssid);
                  setWifiPass(pass);
                }}
                onUpdatePorts={(video, audioIn, audioOut) => {
                  setVideoPort(video);
                  setAudioInPort(audioIn);
                  setAudioOutPort(audioOut);
                }}
              />
            </div>
          )}

          {/* ================= TAB 3: WEB SERIAL CONSOLE ================= */}
          {activeTab === 'serial' && (
            <div className="space-y-4">
              <div className="bg-slate-900/85 p-4 rounded-2xl border border-purple-500/30 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white">Browser Web-Serial Diagnose</h2>
                  <p className="text-xs text-slate-400">
                    Direkte serielle USB-Kommunikation mit dem ESP32-S3 über Google Chrome oder Microsoft Edge.
                  </p>
                </div>
                <div className="text-xs text-rose-300 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-purple-900/40 font-mono">
                  Über UART/COM-Port am DevKit verbinden
                </div>
              </div>

              <WebSerialConsole />
            </div>
          )}

          {/* ================= TAB 4: ARCHITECTURE & WIRING ================= */}
          {activeTab === 'wiring' && (
            <div className="space-y-4">
              <div className="bg-slate-900/85 p-4 rounded-2xl border border-purple-500/30 backdrop-blur-xl">
                <h2 className="text-base font-bold text-white">Hardware-Verdrahtung &amp; Systemarchitektur</h2>
                <p className="text-xs text-slate-400">
                  Detailliertes Diagramm der USB-OTG Pinbelegung, Buchsenunterscheidung und drahtlose Streaming-Topologie.
                </p>
              </div>

              <HardwareDiagram />
            </div>
          )}

          {/* ================= TAB 5: GOOGLE DRIVE FILES ================= */}
          {activeTab === 'drive' && (
            <div className="space-y-6">
              <div className="bg-slate-900/85 p-6 rounded-2xl border border-purple-500/30 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <HardDrive className="w-5 h-5 text-rose-400" />
                    <h2 className="text-base font-bold text-white">Google Drive Projekt-Speicher</h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Verwalte, synchronisiere und lade deine gespeicherten ESP32-S3 Codepakete direkt aus deinem Google Drive Konto.
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => loadDriveFilesList()}
                    disabled={!user || isLoadingDrive}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center space-x-1.5 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDrive ? 'animate-spin' : ''}`} />
                    <span>Liste aktualisieren</span>
                  </button>

                  <button
                    onClick={promptSaveToDrive}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-500 via-purple-600 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white flex items-center space-x-1.5 transition shadow-lg shadow-purple-900/30"
                  >
                    <Cloud className="w-4 h-4" />
                    <span>Neues Bundle sichern</span>
                  </button>
                </div>
              </div>

              {!user ? (
                <div className="bg-slate-900/85 border border-purple-500/25 rounded-2xl p-12 text-center max-w-lg mx-auto backdrop-blur-xl">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-rose-500/20 via-purple-500/20 to-pink-500/20 text-pink-400 flex items-center justify-center mx-auto mb-4 border border-pink-500/30">
                    <Cloud className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">Google Drive verbinden</h3>
                  <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                    Melde dich mit deinem Google-Konto an, um deine ESP32-Firmware, Python-Streamer-Skripte und Netzwerkkonfigurationen dauerhaft und sicher in deinem Google Drive zu sichern.
                  </p>
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={isLoggingIn}
                    className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs inline-flex items-center space-x-2 shadow-lg transition"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    <span>Mit Google anmelden</span>
                  </button>
                </div>
              ) : isLoadingDrive ? (
                <div className="bg-slate-900/85 border border-purple-500/25 rounded-2xl p-12 text-center text-slate-400 font-mono text-xs backdrop-blur-xl">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-pink-400" />
                  <span>Projektdateien aus Google Drive werden geladen...</span>
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="bg-slate-900/85 border border-purple-500/25 rounded-2xl p-12 text-center text-slate-400 backdrop-blur-xl">
                  <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30 text-pink-400" />
                  <h4 className="text-sm font-semibold text-slate-300">Noch keine Bundles gespeichert</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Klicke oben auf "Neues Bundle sichern", um dein erstes Paket mit Firmware und Python-Streamer in Google Drive abzulegen.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {driveFiles.map((file) => (
                    <div
                      key={file.id}
                      className="bg-slate-900/85 border border-purple-500/30 hover:border-pink-500/60 rounded-xl p-5 shadow-lg flex flex-col justify-between transition backdrop-blur-xl"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono uppercase bg-rose-950/70 text-rose-300 border border-rose-800/50 px-2 py-0.5 rounded">
                            PROJEKT-BUNDLE
                          </span>
                          {file.modifiedTime && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(file.modifiedTime).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-white truncate mb-1" title={file.name}>
                          {file.name}
                        </h4>
                        <p className="text-xs text-slate-400 mb-4">
                          Enthält ESP32-S3 UVC/UAC Firmware, Python Streamer, PlatformIO Config &amp; Doku.
                        </p>
                      </div>

                      <div className="pt-3 border-t border-purple-900/40 flex items-center justify-between">
                        <button
                          onClick={() => handleDownloadDriveFile(file)}
                          className="text-xs font-semibold text-pink-400 hover:text-pink-300 flex items-center space-x-1"
                        >
                          <HardDrive className="w-3.5 h-3.5" />
                          <span>Herunterladen</span>
                        </button>

                        <button
                          onClick={() => promptDeleteDriveFile(file)}
                          className="text-xs font-medium text-slate-500 hover:text-rose-400 p-1 rounded-lg hover:bg-slate-800 transition"
                          title="Aus Google Drive löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Hotkey Help Modal */}
        {showHotkeyHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
            <div className="relative w-full max-w-lg bg-slate-900/95 border border-purple-500/40 rounded-2xl shadow-2xl shadow-purple-950/60 p-6 text-slate-100">
              <button
                onClick={() => setShowHotkeyHelp(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2.5 rounded-xl bg-gradient-to-tr from-rose-500/20 to-purple-500/20 text-pink-400 border border-pink-500/40">
                  <Keyboard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Tastatur-Hotkeys (Quellensteuerung)</h3>
                  <p className="text-xs text-rose-200/70">
                    Schalte Videoquellen und Tonfunktionen im laufenden Betrieb direkt per Tastendruck um
                  </p>
                </div>
              </div>

              <div className="space-y-3 my-5 font-sans">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-purple-900/30">
                  <div>
                    <div className="text-xs font-bold text-white">Kamera 1 bis 9 direkt wählen</div>
                    <div className="text-[11px] text-slate-400">Schaltet sofort auf den jeweiligen Kamera-Index um</div>
                  </div>
                  <kbd className="px-2.5 py-1 rounded-lg bg-purple-950 border border-purple-700 text-pink-300 font-mono text-xs font-bold">
                    [ 1 ] - [ 9 ]
                  </kbd>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-purple-900/30">
                  <div>
                    <div className="text-xs font-bold text-white">Bildschirm / Display übertragen</div>
                    <div className="text-[11px] text-slate-400">Desktop, Monitor oder Programmfenster streamen</div>
                  </div>
                  <kbd className="px-2.5 py-1 rounded-lg bg-purple-950 border border-purple-700 text-pink-300 font-mono text-xs font-bold">
                    [ D ] / [ S ]
                  </kbd>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-purple-900/30">
                  <div>
                    <div className="text-xs font-bold text-white">Nächste Kamera durchschalten</div>
                    <div className="text-[11px] text-slate-400">Rotiert sequentiell durch alle erkannten Kameras</div>
                  </div>
                  <kbd className="px-2.5 py-1 rounded-lg bg-purple-950 border border-purple-700 text-pink-300 font-mono text-xs font-bold">
                    [ C ]
                  </kbd>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-purple-900/30">
                  <div>
                    <div className="text-xs font-bold text-white">Mikrofon Stumm / Aktiv</div>
                    <div className="text-[11px] text-slate-400">Mutet die Audioübertragung zum Laptop</div>
                  </div>
                  <kbd className="px-2.5 py-1 rounded-lg bg-purple-950 border border-purple-700 text-pink-300 font-mono text-xs font-bold">
                    [ M ]
                  </kbd>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-purple-900/30">
                  <div>
                    <div className="text-xs font-bold text-white">Stream Pause / Fortsetzen</div>
                    <div className="text-[11px] text-slate-400">Hält die Bildübertragung temporär an</div>
                  </div>
                  <kbd className="px-2.5 py-1 rounded-lg bg-purple-950 border border-purple-700 text-pink-300 font-mono text-xs font-bold">
                    [ Space ]
                  </kbd>
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setShowHotkeyHelp(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 text-white shadow-lg transition"
                >
                  Verstanden
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mandatory Explicit Confirmation Dialog for Drive Operations */}
        <DriveModal
          isOpen={modalConfig.isOpen}
          type={modalConfig.type}
          title={modalConfig.title}
          description={modalConfig.description}
          itemCount={modalConfig.itemCount}
          itemList={modalConfig.itemList}
          isProcessing={modalConfig.isProcessing}
          onConfirm={modalConfig.type === 'save' ? executeSaveToDrive : executeDeleteDriveFile}
          onClose={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
        />

        {/* Footer */}
        <footer className="border-t border-purple-900/30 bg-slate-950/80 text-rose-200/50 text-xs py-4 px-6 text-center backdrop-blur-md">
          <p>
            ESP32-S3 Wireless AV Bridge &bull; UVC Webcam + UAC Mikrofon + UAC Lautsprecher via TinyUSB
          </p>
        </footer>
      </div>
    </div>
  );
}
