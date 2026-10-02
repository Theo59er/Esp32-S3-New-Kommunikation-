import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Usb, Square, Trash2, Send, AlertCircle, CheckCircle2 } from 'lucide-react';

export const WebSerialConsole: React.FC = () => {
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [logs, setLogs] = useState<string[]>([]);
  const [inputCmd, setInputCmd] = useState<string>('');
  const [isReading, setIsReading] = useState<boolean>(false);

  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && !('serial' in navigator)) {
      setIsSupported(false);
    }
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (text: string) => {
    setLogs((prev) => [...prev, text]);
  };

  const handleConnect = async () => {
    if (!('serial' in navigator)) {
      alert('Web Serial API wird in diesem Browser nicht unterstützt. Bitte nutze Google Chrome, Microsoft Edge oder Opera.');
      return;
    }

    try {
      addLog(`[SYSTEM] Fordere USB-Serial-Port an (${baudRate} Baud)...`);
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate });

      portRef.current = port;
      setIsConnected(true);
      addLog('[SYSTEM] Erfolgreich mit ESP32-S3 verbunden! Höre auf serielle Ausgaben...');

      startReading(port);
    } catch (err: any) {
      addLog(`[ERROR] Verbindung fehlgeschlagen: ${err.message || err}`);
    }
  };

  const startReading = async (port: any) => {
    setIsReading(true);
    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    readerRef.current = reader;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          const lines = value.split('\n');
          lines.forEach((l: string) => {
            if (l.trim()) addLog(l);
          });
        }
      }
    } catch (err: any) {
      if (err.name !== 'NetworkError') {
        addLog(`[SERIAL] Lesefehler: ${err.message}`);
      }
    } finally {
      reader.releaseLock();
      setIsReading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
      }
      if (portRef.current) {
        await portRef.current.close();
      }
    } catch (err) {
      console.warn('Disconnect cleanup:', err);
    } finally {
      portRef.current = null;
      readerRef.current = null;
      setIsConnected(false);
      addLog('[SYSTEM] Verbindung zum ESP32-S3 getrennt.');
    }
  };

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portRef.current || !inputCmd.trim()) return;

    try {
      const textEncoder = new TextEncoder();
      const writer = portRef.current.writable.getWriter();
      await writer.write(textEncoder.encode(inputCmd + '\n'));
      writer.releaseLock();
      addLog(`> ${inputCmd}`);
      setInputCmd('');
    } catch (err: any) {
      addLog(`[ERROR] Senden fehlgeschlagen: ${err.message}`);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-purple-500/25 rounded-2xl overflow-hidden shadow-2xl shadow-purple-950/40 backdrop-blur-xl flex flex-col h-[700px]">
      {/* Header bar */}
      <div className="bg-slate-950/90 px-4 py-3 border-b border-purple-900/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Terminal className="w-5 h-5 text-rose-400" />
          <span className="font-bold text-white text-sm">ESP32-S3 Web-Serial Konsole</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-medium flex items-center space-x-1 ${
              isConnected
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {isConnected ? (
              <>
                <CheckCircle2 className="w-3 h-3" />
                <span>ONLINE</span>
              </>
            ) : (
              <span>OFFLINE</span>
            )}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={baudRate}
            disabled={isConnected}
            onChange={(e) => setBaudRate(parseInt(e.target.value))}
            className="bg-slate-900/90 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-rose-500 font-mono"
          >
            <option value={115200}>115200 Baud (Standard)</option>
            <option value={921600}>921600 Baud (Schneller Upload)</option>
            <option value={748800}>748800 Baud</option>
            <option value={9600}>9600 Baud</option>
          </select>

          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={!isSupported}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-rose-500 via-purple-600 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white flex items-center space-x-1.5 transition shadow-lg shadow-purple-900/30 disabled:opacity-50"
            >
              <Usb className="w-3.5 h-3.5" />
              <span>ESP32 verbinden (USB)</span>
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center space-x-1.5 transition shadow"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Trennen</span>
            </button>
          )}

          <button
            onClick={() => setLogs([])}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            title="Terminal leeren"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isSupported && (
        <div className="p-3 bg-amber-950/40 border-b border-amber-800/40 text-amber-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            Web Serial wird nur in Google Chrome, Microsoft Edge und Opera unterstützt. In Firefox oder Safari kannst du den seriellen Monitor der Arduino IDE oder von PlatformIO verwenden.
          </span>
        </div>
      )}

      {/* Terminal Output */}
      <div
        ref={logContainerRef}
        className="flex-1 bg-slate-950/95 p-4 font-mono text-xs leading-relaxed overflow-y-auto text-pink-300 select-text"
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 italic">
            Noch keine seriellen Meldungen. Schließe den UART-Port des ESP32-S3 an den PC an, klicke oben auf "ESP32 verbinden (USB)" und wähle den COM-Port aus, um Bootloader-Logs, PSRAM-Status und die IP-Adresse zu sehen.
          </div>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} className="whitespace-pre-wrap break-all">
              {log}
            </div>
          ))
        )}
      </div>

      {/* Command prompt */}
      <form
        onSubmit={handleSendCommand}
        className="bg-slate-950/90 border-t border-purple-900/30 p-2.5 flex items-center space-x-2"
      >
        <span className="text-rose-400 font-mono font-bold text-xs pl-2">&gt;</span>
        <input
          type="text"
          value={inputCmd}
          onChange={(e) => setInputCmd(e.target.value)}
          disabled={!isConnected}
          placeholder={isConnected ? 'Befehl an ESP32 senden (z. B. STATUS, RESTART, HELP)...' : 'Per USB verbinden, um Befehle zu senden'}
          className="flex-1 bg-slate-900/90 border border-purple-900/40 focus:border-rose-500 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!isConnected || !inputCmd.trim()}
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center space-x-1 transition disabled:opacity-40"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Senden</span>
        </button>
      </form>
    </div>
  );
};
