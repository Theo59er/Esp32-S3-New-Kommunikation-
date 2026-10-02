import React from 'react';
import { Camera, Mic, Volume2, Wifi, Usb, Laptop, Monitor, Cpu, Radio, ShieldCheck } from 'lucide-react';

export const HardwareDiagram: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Visual System Flowchart */}
      <div className="bg-slate-900/90 border border-purple-500/25 rounded-2xl p-6 shadow-2xl shadow-purple-950/40 backdrop-blur-xl overflow-x-auto">
        <h3 className="text-base font-bold text-white mb-2 flex items-center space-x-2">
          <Radio className="w-5 h-5 text-rose-400" />
          <span>Gesamter Signalfluss &amp; Hardware-Architektur</span>
        </h3>
        <p className="text-xs text-slate-400 mb-6">
          Drahtlose Übertragung von Webcam &amp; Mikrofon vom PC zum ESP32-S3 (am Laptop als native USB-Hardware erkannt) inklusive Lautsprecher-Rückkanal.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch min-w-[750px]">
          {/* Node 1: Source PC */}
          <div className="bg-slate-950/90 border border-rose-500/30 rounded-xl p-5 flex flex-col justify-between relative overflow-hidden group hover:border-rose-500/60 transition shadow-lg shadow-rose-950/20">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose-300 bg-rose-950/70 px-2.5 py-1 rounded-md border border-rose-800/50">
                  SENDEGERÄT (PC)
                </span>
                <Monitor className="w-6 h-6 text-rose-400" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">PC / Workstation</h4>
              <p className="text-xs text-slate-400 mb-4">
                Beherbergt physische Webcam, USB-Mikrofon und Kopfhörer. Führt das Python-Skript oder die Web-App aus.
              </p>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center space-x-2.5 bg-slate-900/90 p-2 rounded-lg border border-rose-900/30">
                  <Camera className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span className="text-slate-300">Webcam (OpenCV / Browser Capture)</span>
                </div>
                <div className="flex items-center space-x-2.5 bg-slate-900/90 p-2 rounded-lg border border-pink-900/30">
                  <Mic className="w-4 h-4 text-pink-400 flex-shrink-0" />
                  <span className="text-slate-300">Mikrofon (16kHz 16-Bit PCM Audio)</span>
                </div>
                <div className="flex items-center space-x-2.5 bg-slate-900/90 p-2 rounded-lg border border-purple-900/30">
                  <Volume2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <span className="text-slate-300">PC Kopfhörer (Rückkanal-Wiedergabe)</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-rose-900/40 text-[11px] font-mono text-rose-300 flex items-center justify-between">
              <span>UDP Port 5000 (Video)</span>
              <span>UDP Port 5001 (Mic)</span>
            </div>
          </div>

          {/* Node 2: ESP32-S3 Bridge */}
          <div className="bg-slate-950/90 border-2 border-purple-500/60 rounded-xl p-5 flex flex-col justify-between relative shadow-xl shadow-purple-950/40">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-rose-500 via-purple-600 to-pink-500 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider shadow">
              Drahtlose AV-Bridge
            </div>

            <div>
              <div className="flex items-center justify-between mb-3 mt-1">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-pink-300 bg-pink-950/70 px-2.5 py-1 rounded-md border border-pink-800/50">
                  MIKROCONTROLLER
                </span>
                <Cpu className="w-6 h-6 text-pink-400" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">ESP32-S3 (N8R8 / N16R8)</h4>
              <p className="text-xs text-slate-400 mb-4">
                Dual Xtensa LX7 @ 240MHz + 8MB OPI PSRAM + nativer USB-OTG Hardware-Controller.
              </p>

              <div className="space-y-2 text-xs">
                <div className="bg-slate-900/90 p-2.5 rounded-lg border border-purple-900/40">
                  <div className="font-semibold text-rose-300 text-[11px] flex items-center space-x-1.5 mb-1">
                    <Wifi className="w-3.5 h-3.5 text-rose-400" />
                    <span>Core 0: WLAN &amp; Ringpuffer</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    WLAN 802.11 b/g/n, UDP Frame-Reassembly im PSRAM, Webserver (Port 80).
                  </p>
                </div>

                <div className="bg-slate-900/90 p-2.5 rounded-lg border border-purple-900/40">
                  <div className="font-semibold text-pink-300 text-[11px] flex items-center space-x-1.5 mb-1">
                    <Usb className="w-3.5 h-3.5 text-pink-400" />
                    <span>Core 1: TinyUSB Composite Stack</span>
                  </div>
                  <ul className="text-[11px] text-slate-400 space-y-0.5 list-disc list-inside">
                    <li><b className="text-slate-300">UVC:</b> Isochroner MJPEG Kamera-Endpunkt</li>
                    <li><b className="text-slate-300">UAC Mic:</b> IN Audio-Endpunkt</li>
                    <li><b className="text-slate-300">UAC Speaker:</b> OUT Audio-Endpunkt</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-purple-900/40 text-[11px] font-mono text-pink-300 flex items-center justify-between">
              <span>GPIO 19 (D-)</span>
              <span>GPIO 20 (D+)</span>
            </div>
          </div>

          {/* Node 3: Target Laptop */}
          <div className="bg-slate-950/90 border border-fuchsia-500/30 rounded-xl p-5 flex flex-col justify-between relative overflow-hidden group hover:border-fuchsia-500/60 transition shadow-lg shadow-fuchsia-950/20">
            <div className="absolute top-0 right-0 w-24 h-24 bg-fuchsia-500/10 rounded-full blur-2xl pointer-events-none" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-fuchsia-300 bg-fuchsia-950/70 px-2.5 py-1 rounded-md border border-fuchsia-800/50">
                  ZIELGERÄT (LAPTOP)
                </span>
                <Laptop className="w-6 h-6 text-fuchsia-400" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">Laptop / Arbeitsgerät</h4>
              <p className="text-xs text-slate-400 mb-4">
                Wird per USB-Kabel mit dem ESP32-S3 verbunden. Erkennt treiberlos Standard-Hardware.
              </p>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center space-x-2.5 bg-slate-900/90 p-2 rounded-lg border border-fuchsia-900/30">
                  <Camera className="w-4 h-4 text-fuchsia-400 flex-shrink-0" />
                  <div>
                    <div className="text-slate-200 font-medium">"ESP32-S3 Wireless AV Camera"</div>
                    <div className="text-[10px] text-slate-500">Zoom, MS Teams, Google Meet, OBS</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2.5 bg-slate-900/90 p-2 rounded-lg border border-pink-900/30">
                  <Mic className="w-4 h-4 text-pink-400 flex-shrink-0" />
                  <div>
                    <div className="text-slate-200 font-medium">"ESP32-S3 Wireless Mic"</div>
                    <div className="text-[10px] text-slate-500">Standard Audio-Eingabegerät</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2.5 bg-slate-900/90 p-2 rounded-lg border border-purple-900/30">
                  <Volume2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <div>
                    <div className="text-slate-200 font-medium">"ESP32-S3 Wireless Speaker"</div>
                    <div className="text-[10px] text-slate-500">Laptop-Ton zurück zum PC</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-fuchsia-900/40 text-[11px] font-mono text-fuchsia-300 flex items-center justify-between">
              <span>Standard UVC/UAC</span>
              <span>Treiberloses Plug &amp; Play</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hardware Pinout & Dual Port Guide */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/90 border border-purple-500/25 rounded-2xl p-5 shadow-xl backdrop-blur-xl">
          <div className="flex items-center space-x-2 mb-3">
            <Usb className="w-5 h-5 text-rose-400" />
            <h4 className="text-sm font-bold text-white">ESP32-S3 DevKit: Die beiden USB-Ports</h4>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Fast alle ESP32-S3 DevKits haben <b>zwei USB-C Buchsen</b> nebeneinander. Die Wahl der richtigen Buchse ist entscheidend:
          </p>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="font-semibold text-amber-300 mb-1 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Buchse 1: "UART" / "COM" Port</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Mit CH340 oder CP2102 Bridge-Chip verbunden. Diesen Port mit dem PC verbinden, um Firmware zu flashen oder den Serial Monitor zu beobachten.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-rose-500/40">
              <div className="font-semibold text-rose-300 mb-1 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                <span>Buchse 2: "USB" / "OTG" Nativer Port</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Direkt mit den internen USB-Leitungen des ESP32-S3 verbunden (GPIO 19 &amp; 20). <b>Diesen Port an den Laptop anschließen</b>, damit Windows die Kamera, das Mikrofon und die Lautsprecher erkennt!
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-purple-500/25 rounded-2xl p-5 shadow-xl backdrop-blur-xl">
          <div className="flex items-center space-x-2 mb-3">
            <ShieldCheck className="w-5 h-5 text-pink-400" />
            <h4 className="text-sm font-bold text-white">Direktes USB-Pinout (Eigenbau-Verdrahtung)</h4>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Falls ihr ein reines Modul ohne DevKit-Buchsen verwendet oder ein USB-Kabel direkt anlötet:
          </p>

          <div className="overflow-hidden rounded-xl border border-purple-900/40 bg-slate-950/80 text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900/90 border-b border-purple-900/30 text-[10px] font-mono uppercase text-rose-300">
                  <th className="p-2.5">ESP32-S3 Pin</th>
                  <th className="p-2.5">USB Kabelfarbe</th>
                  <th className="p-2.5">Signalbeschreibung</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] text-slate-300">
                <tr>
                  <td className="p-2.5 text-rose-400 font-bold">GPIO 19</td>
                  <td className="p-2.5 text-white">Weiß</td>
                  <td className="p-2.5 text-slate-400 font-sans">USB D- (Data Minus)</td>
                </tr>
                <tr>
                  <td className="p-2.5 text-pink-400 font-bold">GPIO 20</td>
                  <td className="p-2.5 text-pink-300 font-bold">Grün</td>
                  <td className="p-2.5 text-slate-400 font-sans">USB D+ (Data Plus)</td>
                </tr>
                <tr>
                  <td className="p-2.5 text-rose-500 font-bold">5V / VBUS</td>
                  <td className="p-2.5 text-rose-400">Rot</td>
                  <td className="p-2.5 text-slate-400 font-sans">+5V Stromversorgung vom Host</td>
                </tr>
                <tr>
                  <td className="p-2.5 text-slate-400 font-bold">GND</td>
                  <td className="p-2.5 text-slate-500">Schwarz</td>
                  <td className="p-2.5 text-slate-400 font-sans">Gemeinsame Masse (Ground)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 italic">
            Hinweis: Die GPIOs 19 und 20 verfügen über interne 1.5k Pull-Up-Widerstände für USB Full-Speed (12 Mbps). Externe Widerstände sind nicht erforderlich.
          </div>
        </div>
      </div>
    </div>
  );
};
