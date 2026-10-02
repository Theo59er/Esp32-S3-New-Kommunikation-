import React, { useState } from 'react';
import { Check, Copy, Download, FileCode, Sliders } from 'lucide-react';
import { CodeTemplate } from '../data/codeTemplates';

interface CodeViewerProps {
  templates: CodeTemplate[];
  wifiSsid: string;
  wifiPass: string;
  espIp: string;
  videoPort: number;
  audioInPort: number;
  audioOutPort: number;
  onUpdateWifi: (ssid: string, pass: string) => void;
  onUpdatePorts: (video: number, audioIn: number, audioOut: number) => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  templates,
  wifiSsid,
  wifiPass,
  espIp,
  videoPort,
  audioInPort,
  audioOutPort,
  onUpdateWifi,
  onUpdatePorts,
}) => {
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id || 'esp32-firmware');
  const [copied, setCopied] = useState<boolean>(false);
  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);

  const currentTemplate = templates.find((t) => t.id === selectedId) || templates[0];

  const getCustomizedCode = (template: CodeTemplate): string => {
    let code = template.code;
    if (template.id === 'esp32-firmware') {
      code = code.replace(/YOUR_WIFI_SSID/g, wifiSsid);
      code = code.replace(/YOUR_WIFI_PASSWORD/g, wifiPass);
      code = code.replace(/const int VIDEO_UDP_PORT = \d+;/g, `const int VIDEO_UDP_PORT = ${videoPort};`);
      code = code.replace(/const int AUDIO_IN_UDP_PORT = \d+;/g, `const int AUDIO_IN_UDP_PORT = ${audioInPort};`);
      code = code.replace(/const int AUDIO_OUT_UDP_PORT = \d+;/g, `const int AUDIO_OUT_UDP_PORT = ${audioOutPort};`);
    } else if (template.id === 'python-streamer') {
      code = code.replace(/DEFAULT_ESP_IP = "[^"]*"/g, `DEFAULT_ESP_IP = "${espIp}"`);
      code = code.replace(/VIDEO_PORT = \d+/g, `VIDEO_PORT = ${videoPort}`);
      code = code.replace(/AUDIO_IN_PORT = \d+/g, `AUDIO_IN_PORT = ${audioInPort}`);
      code = code.replace(/AUDIO_OUT_PORT = \d+/g, `AUDIO_OUT_PORT = ${audioOutPort}`);
    }
    return code;
  };

  const processedCode = currentTemplate ? getCustomizedCode(currentTemplate) : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(processedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!currentTemplate) return;
    const blob = new Blob([processedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = currentTemplate.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900/90 border border-purple-500/25 rounded-2xl overflow-hidden shadow-2xl shadow-purple-950/40 backdrop-blur-xl flex flex-col h-[750px]">
      {/* File Navigation & Actions */}
      <div className="bg-slate-950/90 px-4 py-3 border-b border-purple-900/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-1.5 overflow-x-auto py-1">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => setSelectedId(tpl.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-2 transition ${
                selectedId === tpl.id
                  ? 'bg-gradient-to-r from-rose-500/20 via-purple-500/20 to-pink-500/20 text-rose-300 border border-rose-500/40 font-semibold shadow-sm shadow-rose-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-purple-400" />
              <span>{tpl.filename}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowConfigDrawer(!showConfigDrawer)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition border ${
              showConfigDrawer
                ? 'bg-rose-500/20 text-rose-200 border-rose-500/50 shadow-md shadow-rose-950/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Configure Wi-Fi and Ports directly in code"
          >
            <Sliders className="w-3.5 h-3.5 text-pink-400" />
            <span>Parameter anpassen</span>
          </button>

          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center space-x-1.5 transition border border-slate-700"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Kopiert!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-purple-300" />
                <span>Kopieren</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-rose-500 via-purple-600 to-pink-600 hover:from-rose-400 hover:to-pink-500 text-white flex items-center space-x-1.5 transition shadow-lg shadow-purple-900/30"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Herunterladen</span>
          </button>
        </div>
      </div>

      {/* Embedded Parameter Configurator */}
      {showConfigDrawer && (
        <div className="bg-slate-950/95 border-b border-rose-500/30 p-4 animate-fadeIn text-xs backdrop-blur-md">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-rose-300 flex items-center space-x-1.5">
              <Sliders className="w-4 h-4 text-pink-400" />
              <span>Echtzeit-Variablen Injektor</span>
            </span>
            <span className="text-slate-400 text-[11px]">
              Änderungen werden sofort in den untenstehenden Code übernommen
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-rose-300/80 text-[10px] font-mono uppercase block mb-1">
                WLAN SSID
              </label>
              <input
                type="text"
                value={wifiSsid}
                onChange={(e) => onUpdateWifi(e.target.value, wifiPass)}
                placeholder="MeinWLAN"
                className="w-full bg-slate-900/90 border border-slate-700 focus:border-rose-500 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-rose-300/80 text-[10px] font-mono uppercase block mb-1">
                WLAN Passwort
              </label>
              <input
                type="text"
                value={wifiPass}
                onChange={(e) => onUpdateWifi(wifiSsid, e.target.value)}
                placeholder="Passwort123"
                className="w-full bg-slate-900/90 border border-slate-700 focus:border-rose-500 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-purple-300/80 text-[10px] font-mono uppercase block mb-1">
                Video Port (UDP)
              </label>
              <input
                type="number"
                value={videoPort}
                onChange={(e) => onUpdatePorts(parseInt(e.target.value) || 5000, audioInPort, audioOutPort)}
                className="w-full bg-slate-900/90 border border-slate-700 focus:border-purple-500 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-pink-300/80 text-[10px] font-mono uppercase block mb-1">
                Mic Port (PC-&gt;ESP)
              </label>
              <input
                type="number"
                value={audioInPort}
                onChange={(e) => onUpdatePorts(videoPort, parseInt(e.target.value) || 5001, audioOutPort)}
                className="w-full bg-slate-900/90 border border-slate-700 focus:border-pink-500 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="text-indigo-300/80 text-[10px] font-mono uppercase block mb-1">
                Speaker Port (ESP-&gt;PC)
              </label>
              <input
                type="number"
                value={audioOutPort}
                onChange={(e) => onUpdatePorts(videoPort, audioInPort, parseInt(e.target.value) || 5002)}
                className="w-full bg-slate-900/90 border border-slate-700 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {/* File Description Header */}
      <div className="bg-slate-900/60 px-4 py-2 border-b border-purple-900/30 flex items-center justify-between text-xs text-slate-400">
        <span>{currentTemplate?.description}</span>
        <span className="font-mono text-pink-300 uppercase text-[10px] px-2 py-0.5 rounded bg-pink-950/60 border border-pink-800/50">
          {currentTemplate?.language}
        </span>
      </div>

      {/* Code Editor Body */}
      <div className="flex-1 overflow-auto bg-slate-950/95 p-4 font-mono text-xs leading-relaxed text-slate-200 select-text">
        <pre className="whitespace-pre">
          <code>{processedCode}</code>
        </pre>
      </div>
    </div>
  );
};
