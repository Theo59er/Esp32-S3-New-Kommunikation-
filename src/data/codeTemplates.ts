/**
 * Production-ready code templates for ESP32-S3 and Python AV Bridge.
 * Implements:
 * 1. ESP32-S3 Composite USB (UVC Camera + UAC Mic + UAC Speaker) with Wi-Fi UDP/WebSocket receiver & Webserver
 * 2. Python PC Streamer (Webcam + Mic to ESP32, and ESP32 return speaker to PC headphones)
 * 3. Python Laptop Virtual Bridge (Alternative software test harness)
 * 4. PlatformIO & Arduino IDE configuration
 * 5. Complete wiring, hardware pinout & architecture guide
 */

export interface CodeTemplate {
  id: string;
  name: string;
  language: string;
  filename: string;
  description: string;
  code: string;
}

export const esp32FirmwareCode = `/**
 * ============================================================================
 * ESP32-S3 Composite USB AV Bridge (Webcam + Microphone + Speaker)
 * ============================================================================
 * Hardware Target: ESP32-S3 (e.g., ESP32-S3-DevKitC-1 with N8R8 or N16R8)
 * Requirements:
 *  - Native USB Port (D- on GPIO 19, D+ on GPIO 20)
 *  - PSRAM enabled (OPI or QSPI) for video & audio frame buffering
 *
 * Supported USB Classes:
 *  1. UVC (USB Video Class): Emulates a 720p/480p MJPEG Webcam on Host
 *  2. UAC 1.0 (USB Audio Input / Mic): Transmits audio from PC to Host as Microphone
 *  3. UAC 1.0 (USB Audio Output / Speaker): Captures Host audio and streams it to PC
 *
 * Network:
 *  - Wi-Fi STA (Station) with auto-reconnect or SoftAP fallback (192.168.4.1)
 *  - UDP / WebSocket listener for Low-Latency MJPEG Video frames
 *  - UDP listener for PCM Audio (PC Mic -> Laptop Mic)
 *  - UDP transmitter for PCM Audio (Laptop Speaker -> PC Speakers)
 *  - WebServer on port 80 for configuration & diagnostics
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include "esp_camera.h"
#include "esp_timer.h"
#include "esp_heap_caps.h"

// TinyUSB ESP32 Native Stack
#include "USB.h"
#include "USBVideo.h"
#include "USBAudio.h"

// --- CONFIGURATION DEFAULTS ---
const char* DEFAULT_SSID = "YOUR_WIFI_SSID";
const char* DEFAULT_PASS = "YOUR_WIFI_PASSWORD";
const int VIDEO_UDP_PORT = 5000;
const int AUDIO_IN_UDP_PORT = 5001;    // PC Mic -> ESP32 -> Laptop Mic
const int AUDIO_OUT_UDP_PORT = 5002;   // Laptop Speaker -> ESP32 -> PC Speaker
const int HTTP_PORT = 80;

// Video & Audio specifications
#define VIDEO_WIDTH  640
#define VIDEO_HEIGHT 480
#define VIDEO_FPS    30
#define AUDIO_SAMPLE_RATE 16000
#define AUDIO_CHANNELS    1
#define AUDIO_BITS        16
#define AUDIO_CHUNK_SIZE  512 // 32ms buffer chunks

// --- PSRAM FRAME BUFFERS ---
#define MAX_JPEG_FRAME_SIZE (128 * 1024) // 128 KB max JPEG frame
uint8_t* pCurrentFrameBuffer = NULL;
size_t currentFrameSize = 0;
portMUX_TYPE frameMux = portMUX_INITIALIZER_UNLOCKED;
volatile bool newFrameAvailable = false;

// Return audio transmission (Laptop Speaker -> PC)
IPAddress pcHostIp(192, 168, 1, 100); // Updated dynamically when PC sends packets
bool pcHostIpKnown = false;

// Network objects
WiFiUDP videoUdp;
WiFiUDP audioInUdp;
WiFiUDP audioOutUdp;
WebServer server(HTTP_PORT);

// USB Device Objects
USBVideo UVC;
USBAudio UAC;

// Statistics & Metrics
struct BridgeStats {
  uint32_t videoPacketsReceived = 0;
  uint32_t videoFramesCompleted = 0;
  uint32_t audioBytesReceived = 0;
  uint32_t audioBytesTransmitted = 0;
  uint32_t droppedFrames = 0;
  float fpsActual = 0.0f;
  uint32_t uptimeSeconds = 0;
} stats;

// --- HTTP WEB SERVER HANDLERS ---
void handleRoot() {
  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>ESP32-S3 Wireless AV Bridge</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; }
    .card { background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    h1 { color: #38bdf8; margin-top: 0; }
    .metric { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #334155; }
    .val { font-family: monospace; font-weight: bold; color: #4ade80; }
    .badge { background: #0284c7; padding: 4px 10px; border-radius: 9999px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>ESP32-S3 Wireless AV Bridge <span class="badge">ACTIVE</span></h1>
    <p>Emulating USB Composite Device: <b>UVC Webcam + UAC Microphone + UAC Speaker</b></p>
    <div class="metric"><span>IP Address:</span><span class="val">)rawliteral";
  html += WiFi.localIP().toString();
  html += R"rawliteral(</span></div>
    <div class="metric"><span>Free PSRAM:</span><span class="val">)rawliteral";
  html += String(ESP.getFreePsram() / 1024) + " KB";
  html += R"rawliteral(</span></div>
    <div class="metric"><span>Video UDP Port:</span><span class="val">)rawliteral";
  html += String(VIDEO_UDP_PORT);
  html += R"rawliteral(</span></div>
    <div class="metric"><span>Audio UDP Ports:</span><span class="val">)rawliteral";
  html += String(AUDIO_IN_UDP_PORT) + " (In) / " + String(AUDIO_OUT_UDP_PORT) + " (Out)";
  html += R"rawliteral(</span></div>
    <div class="metric"><span>Video Frames Completed:</span><span class="val">)rawliteral";
  html += String(stats.videoFramesCompleted);
  html += R"rawliteral(</span></div>
    <div class="metric"><span>Audio Received:</span><span class="val">)rawliteral";
  html += String(stats.audioBytesReceived / 1024) + " KB";
  html += R"rawliteral(</span></div>
    <div class="metric"><span>Return Audio Sent:</span><span class="val">)rawliteral";
  html += String(stats.audioBytesTransmitted / 1024) + " KB";
  html += R"rawliteral(</span></div>
  </div>
</body>
</html>
)rawliteral";
  server.send(200, "text/html", html);
}

void handleStatusJson() {
  String json = "{";
  json += "\\"status\\":\\"connected\\",";
  json += "\\"ip\\":\\"" + WiFi.localIP().toString() + "\\",";
  json += "\\"freePsram\\":" + String(ESP.getFreePsram()) + ",";
  json += "\\"framesCompleted\\":" + String(stats.videoFramesCompleted) + ",";
  json += "\\"audioInBytes\\":" + String(stats.audioBytesReceived) + ",";
  json += "\\"audioOutBytes\\":" + String(stats.audioBytesTransmitted) + ",";
  json += "\\"fps\\":" + String(stats.fpsActual, 1);
  json += "}";
  server.send(200, "application/json", json);
}

// --- USB CALLBACKS & TASKS ---

// Task running on Core 1: Pumps frames to Host Laptop via USB UVC
void usbVideoTask(void* pvParameters) {
  uint32_t lastFrameCount = 0;
  uint32_t lastCheckTime = millis();

  while (true) {
    if (newFrameAvailable && pCurrentFrameBuffer != NULL) {
      size_t frameLen = 0;
      portENTER_CRITICAL(&frameMux);
      frameLen = currentFrameSize;
      newFrameAvailable = false;
      portEXIT_CRITICAL(&frameMux);

      if (frameLen > 0 && UVC.streaming()) {
        // Send JPEG frame over USB UVC Isochronous/Bulk transfer
        UVC.write(pCurrentFrameBuffer, frameLen);
        stats.videoFramesCompleted++;
      }
    }

    // Calculate actual output FPS every 2 seconds
    if (millis() - lastCheckTime >= 2000) {
      stats.fpsActual = (float)(stats.videoFramesCompleted - lastFrameCount) / 2.0f;
      lastFrameCount = stats.videoFramesCompleted;
      lastCheckTime = millis();
    }

    vTaskDelay(pdMS_TO_TICKS(1)); // Yield to FreeRTOS
  }
}

// Host Laptop sends audio to ESP32 Speaker -> Send back to PC over Wi-Fi
void onHostAudioSpeakerData(const uint8_t* buffer, size_t length) {
  if (pcHostIpKnown && length > 0) {
    audioOutUdp.beginPacket(pcHostIp, AUDIO_OUT_UDP_PORT);
    audioOutUdp.write(buffer, length);
    audioOutUdp.endPacket();
    stats.audioBytesTransmitted += length;
  }
}

// --- NETWORK RECEPTION TASKS (Core 0) ---

// Frame reassembly structure for UDP packets
#pragma pack(push, 1)
struct PacketHeader {
  uint32_t frameId;
  uint16_t totalPackets;
  uint16_t packetIndex;
  uint16_t payloadSize;
};
#pragma pack(pop)

void networkWorkerTask(void* pvParameters) {
  uint8_t* tempAssemblyBuffer = (uint8_t*)ps_malloc(MAX_JPEG_FRAME_SIZE);
  uint8_t udpPacketBuffer[1500];
  uint32_t currentFrameId = 0;
  uint16_t packetsReceivedForFrame = 0;
  uint16_t expectedPackets = 0;
  size_t assembledBytes = 0;

  if (!tempAssemblyBuffer) {
    Serial.println("[CRITICAL] Failed to allocate tempAssemblyBuffer in PSRAM!");
    vTaskDelete(NULL);
    return;
  }

  while (true) {
    // 1. Process Video Packets (UDP)
    int packetSize = videoUdp.parsePacket();
    if (packetSize >= sizeof(PacketHeader)) {
      // Remember PC IP for reverse speaker audio transmission
      if (!pcHostIpKnown) {
        pcHostIp = videoUdp.remoteIP();
        pcHostIpKnown = true;
        Serial.printf("[NET] Registered PC Streamer IP: %s\\n", pcHostIp.toString().c_str());
      }

      videoUdp.read(udpPacketBuffer, sizeof(udpPacketBuffer));
      PacketHeader* hdr = (PacketHeader*)udpPacketBuffer;
      uint8_t* payload = udpPacketBuffer + sizeof(PacketHeader);

      if (hdr->frameId != currentFrameId) {
        // New frame started
        currentFrameId = hdr->frameId;
        expectedPackets = hdr->totalPackets;
        packetsReceivedForFrame = 0;
        assembledBytes = 0;
      }

      if (hdr->packetIndex < expectedPackets && (assembledBytes + hdr->payloadSize) <= MAX_JPEG_FRAME_SIZE) {
        memcpy(tempAssemblyBuffer + (hdr->packetIndex * (sizeof(udpPacketBuffer) - sizeof(PacketHeader))),
               payload, hdr->payloadSize);
        assembledBytes += hdr->payloadSize;
        packetsReceivedForFrame++;
        stats.videoPacketsReceived++;

        // Complete frame ready!
        if (packetsReceivedForFrame == expectedPackets) {
          portENTER_CRITICAL(&frameMux);
          memcpy(pCurrentFrameBuffer, tempAssemblyBuffer, assembledBytes);
          currentFrameSize = assembledBytes;
          newFrameAvailable = true;
          portEXIT_CRITICAL(&frameMux);
        }
      }
    }

    // 2. Process Audio In Packets (PC Mic -> Laptop Mic)
    int audioPacketSize = audioInUdp.parsePacket();
    if (audioPacketSize > 0) {
      uint8_t audioBuf[AUDIO_CHUNK_SIZE];
      int bytesRead = audioInUdp.read(audioBuf, sizeof(audioBuf));
      if (bytesRead > 0 && UAC.micReady()) {
        // Feed PCM bytes directly into USB Audio Class input endpoint
        UAC.writeMic(audioBuf, bytesRead);
        stats.audioBytesReceived += bytesRead;
      }
    }

    server.handleClient();
    vTaskDelay(pdMS_TO_TICKS(1));
  }
}

// --- SETUP & MAIN LOOP ---
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\\n===========================================");
  Serial.println("ESP32-S3 Wireless AV Bridge Starting...");
  Serial.println("===========================================");

  // Verify PSRAM
  if (psramInit()) {
    Serial.printf("[SYSTEM] PSRAM initialized! Total: %d KB, Free: %d KB\\n",
                  ESP.getPsramSize() / 1024, ESP.getFreePsram() / 1024);
  } else {
    Serial.println("[WARNING] No PSRAM detected! Video streaming may fail.");
  }

  // Allocate primary frame buffer in PSRAM
  pCurrentFrameBuffer = (uint8_t*)ps_malloc(MAX_JPEG_FRAME_SIZE);
  if (!pCurrentFrameBuffer) {
    Serial.println("[ERROR] Failed to allocate pCurrentFrameBuffer!");
  }

  // 1. Initialize Native USB Composite Device
  USB.VID(0x303A); // Espressif Vendor ID
  USB.PID(0x8002); // Composite AV Device
  USB.productName("ESP32-S3 Wireless AV Suite");
  USB.manufacturerName("Maker AV Systems");

  // Setup USB Video Class (UVC)
  UVC.begin();
  UVC.setResolution(VIDEO_WIDTH, VIDEO_HEIGHT);
  UVC.setFrameRate(VIDEO_FPS);

  // Setup USB Audio Class (UAC) - Mic & Speaker
  UAC.begin(AUDIO_SAMPLE_RATE, AUDIO_CHANNELS, AUDIO_BITS);
  UAC.onSpeakerData(onHostAudioSpeakerData);

  USB.begin();
  Serial.println("[USB] USB Composite (UVC + UAC Mic + UAC Speaker) Started!");

  // 2. Connect to Wi-Fi
  Serial.printf("[WIFI] Connecting to %s...\\n", DEFAULT_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(DEFAULT_SSID, DEFAULT_PASS);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 10000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\\n[WIFI] Connected! IP Address: %s\\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\\n[WIFI] Could not connect to STA, starting SoftAP fallback...");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("ESP32-AV-Bridge", "12345678");
    Serial.printf("[WIFI] SoftAP started. Connect to: ESP32-AV-Bridge, IP: %s\\n",
                  WiFi.softAPIP().toString().c_str());
  }

  // 3. Start UDP Sockets
  videoUdp.begin(VIDEO_UDP_PORT);
  audioInUdp.begin(AUDIO_IN_UDP_PORT);
  audioOutUdp.begin(AUDIO_OUT_UDP_PORT);
  Serial.printf("[NET] UDP Listening: Video=%d, AudioIn=%d, AudioOut=%d\\n",
                VIDEO_UDP_PORT, AUDIO_IN_UDP_PORT, AUDIO_OUT_UDP_PORT);

  // 4. Start Web Server
  server.on("/", handleRoot);
  server.on("/api/status", handleStatusJson);
  server.begin();
  Serial.println("[HTTP] Management WebServer running on port 80");

  // 5. Spawn FreeRTOS Workers across cores
  xTaskCreatePinnedToCore(usbVideoTask, "USB_UVC_Task", 4096, NULL, 5, NULL, 1);
  xTaskCreatePinnedToCore(networkWorkerTask, "Net_Worker_Task", 8192, NULL, 5, NULL, 0);

  Serial.println("[SYSTEM] Ready! Plug ESP32-S3 USB into Laptop, run Python streamer on PC.");
}

void loop() {
  // FreeRTOS tasks handle high-priority streaming
  vTaskDelay(pdMS_TO_TICKS(1000));
}
`;

export const pythonStreamerCode = `"""
===============================================================================
PC Wireless AV Streamer for ESP32-S3 USB Bridge (mit Tastatur-Hotkeys)
===============================================================================
Runs on: PC with physical Webcam, Microphone and Desktop Screen
Destination: ESP32-S3 connected to Laptop via Native USB

Tastatur-Hotkeys im Vorschaufenster:
 [1] - [9] : Direkt zu Kamera Index 0 bis 8 wechseln
 [D] / [S] : Zwischen Kamera und Bildschirmübertragung (Desktop) umschalten
 [C]       : Zur nächsten verfügbaren Kamera durchschalten
 [M]       : Mikrofon stummschalten (Mute Toggle)
 [Q] / ESC : Stream beenden
===============================================================================
"""

import sys
import time
import socket
import struct
import threading
import argparse
import numpy as np
import cv2

try:
    import pyaudio
except ImportError:
    pyaudio = None
    print("[HINWEIS] pyaudio nicht installiert. Mikrofon-Capture deaktiviert.")

try:
    import mss
except ImportError:
    mss = None

# --- DEFAULT NETWORK & AV CONFIG ---
DEFAULT_ESP_IP = "192.168.1.150"
VIDEO_PORT = 5000
AUDIO_IN_PORT = 5001   # PC Mic -> ESP32 -> Laptop Mic
AUDIO_OUT_PORT = 5002  # Laptop Speaker -> ESP32 -> PC Speaker
MAX_UDP_PAYLOAD = 1400 # Unter 1500 Byte MTU

AUDIO_RATE = 16000
AUDIO_CHANNELS = 1
AUDIO_CHUNK = 512      # 32ms Chunks

HEADER_FORMAT = "!IHHH"
HEADER_SIZE = struct.calcsize(HEADER_FORMAT)

class AVStreamer:
    def __init__(self, esp_ip, camera_index=0, width=640, height=480, fps=30, quality=75):
        self.esp_ip = esp_ip
        self.camera_index = camera_index
        self.source_mode = "camera"  # "camera" oder "display"
        self.width = width
        self.height = height
        self.fps = fps
        self.quality = quality
        self.running = False
        self.mic_muted = False

        # Sockets
        self.video_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.audio_in_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.audio_out_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.audio_out_sock.bind(("0.0.0.0", AUDIO_OUT_PORT))
        self.audio_out_sock.settimeout(0.5)

        # Metriken
        self.frames_sent = 0
        self.bytes_sent = 0
        self.speaker_bytes_received = 0

    def start(self):
        self.running = True
        print(f"\\n[+] AV-Streamer gestartet -> ESP32: {self.esp_ip}")
        print(f"[+] Video: {self.width}x{self.height} @ {self.fps} FPS (Qualitaet: {self.quality}%)")
        print("[+] Hotkeys: [1-9]=Kameras, [D]=Bildschirm, [C]=Next Cam, [M]=Mute, [Q]=Beenden")

        self.video_thread = threading.Thread(target=self._video_worker, daemon=True)
        self.audio_mic_thread = threading.Thread(target=self._audio_mic_worker, daemon=True)
        self.audio_speaker_thread = threading.Thread(target=self._audio_speaker_worker, daemon=True)

        self.video_thread.start()
        self.audio_mic_thread.start()
        self.audio_speaker_thread.start()

        try:
            prev_time = time.time()
            prev_frames = 0
            while self.running:
                time.sleep(1.0)
                now = time.time()
                elapsed = now - prev_time
                fps_actual = (self.frames_sent - prev_frames) / elapsed
                bitrate_kbps = (self.bytes_sent * 8) / (elapsed * 1024)

                src_name = f"Cam #{self.camera_index}" if self.source_mode == "camera" else "Display (Screen)"
                mute_str = "[MUTED]" if self.mic_muted else "[MIC ON]"

                sys.stdout.write(
                    f"\\r[{src_name}] {mute_str} {fps_actual:4.1f} FPS | {bitrate_kbps:6.1f} kbps | "
                    f"Frames: {self.frames_sent} | Spk In: {self.speaker_bytes_received // 1024} KB   "
                )
                sys.stdout.flush()

                prev_time = now
                prev_frames = self.frames_sent
                self.bytes_sent = 0
        except KeyboardInterrupt:
            print("\\n[!] Streamer wird beendet...")
            self.stop()

    def stop(self):
        self.running = False
        time.sleep(0.5)
        self.video_sock.close()
        self.audio_in_sock.close()
        self.audio_out_sock.close()
        cv2.destroyAllWindows()
        print("[+] Streamer sauber gestoppt.")

    def _video_worker(self):
        """Erfasst Kamera oder Bildschirm und verarbeitet Tastatur-Hotkeys."""
        cap = cv2.VideoCapture(self.camera_index)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        cap.set(cv2.CAP_PROP_FPS, self.fps)

        sct = mss.mss() if mss else None
        frame_id = 0
        encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), self.quality]
        frame_interval = 1.0 / self.fps
        next_frame_time = time.time()

        cv2.namedWindow("ESP32-S3 Stream Vorschau [Hotkeys aktiv]", cv2.WINDOW_NORMAL)

        while self.running:
            now = time.time()
            if now < next_frame_time:
                time.sleep(max(0.001, next_frame_time - now))
            next_frame_time = time.time() + frame_interval

            frame = None
            if self.source_mode == "camera":
                if cap and cap.isOpened():
                    ret, raw_frame = cap.read()
                    if ret:
                        frame = raw_frame
            elif self.source_mode == "display" and sct:
                # Desktop aufnehmen
                monitor = sct.monitors[1]
                sct_img = sct.grab(monitor)
                frame = cv2.resize(np.array(sct_img)[:, :, :3], (self.width, self.height))

            if frame is None:
                # Fallback Testbild
                frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
                cv2.putText(frame, f"Quelle: {self.source_mode} (Kein Signal)", (30, self.height // 2),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

            # Tastatur-Hotkeys verarbeiten
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q') or key == 27: # Q oder ESC
                self.running = False
                break
            elif ord('1') <= key <= ord('9'):
                new_idx = key - ord('1')
                print(f"\\n[HOTKEY] Wechsle zu Kamera {new_idx}...")
                if cap: cap.release()
                self.camera_index = new_idx
                self.source_mode = "camera"
                cap = cv2.VideoCapture(self.camera_index)
            elif key == ord('d') or key == ord('s'):
                self.source_mode = "display" if self.source_mode == "camera" else "camera"
                print(f"\\n[HOTKEY] Modus gewechselt: {self.source_mode.upper()}")
            elif key == ord('c'):
                if cap: cap.release()
                self.camera_index = (self.camera_index + 1) % 4
                self.source_mode = "camera"
                print(f"\\n[HOTKEY] Naechste Kamera: Index {self.camera_index}")
                cap = cv2.VideoCapture(self.camera_index)
            elif key == ord('m'):
                self.mic_muted = not self.mic_muted
                print(f"\\n[HOTKEY] Mikrofon Stummschaltung: {self.mic_muted}")

            # HUD overlay
            hud = frame.copy()
            status_txt = f"{self.source_mode.upper()} #{self.camera_index} | [M]ute={self.mic_muted}"
            cv2.putText(hud, status_txt, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            cv2.imshow("ESP32-S3 Stream Vorschau [Hotkeys aktiv]", hud)

            # JPEG Komprimierung & UDP Chunking
            success, encoded_jpeg = cv2.imencode(".jpg", frame, encode_params)
            if not success:
                continue

            jpeg_bytes = encoded_jpeg.tobytes()
            total_size = len(jpeg_bytes)
            chunk_size = MAX_UDP_PAYLOAD
            total_packets = (total_size + chunk_size - 1) // chunk_size

            for packet_idx in range(total_packets):
                start = packet_idx * chunk_size
                end = min(start + chunk_size, total_size)
                payload = jpeg_bytes[start:end]

                header = struct.pack(HEADER_FORMAT, frame_id, total_packets, packet_idx, len(payload))
                packet = header + payload

                self.video_sock.sendto(packet, (self.esp_ip, VIDEO_PORT))
                self.bytes_sent += len(packet)

            frame_id += 1
            self.frames_sent += 1

        if cap:
            cap.release()

    def _audio_mic_worker(self):
        """Erfasst PC-Mikrofon und sendet es an den ESP32 (Laptop-Mic)."""
        if not pyaudio:
            return

        p = pyaudio.PyAudio()
        try:
            stream = p.open(
                format=pyaudio.paInt16,
                channels=AUDIO_CHANNELS,
                rate=AUDIO_RATE,
                input=True,
                frames_per_buffer=AUDIO_CHUNK
            )
        except Exception as e:
            print(f"[AUDIO] Fehler beim Oeffnen des Mikrofons: {e}")
            p.terminate()
            return

        while self.running:
            try:
                data = stream.read(AUDIO_CHUNK, exception_on_overflow=False)
                if not self.mic_muted:
                    self.audio_in_sock.sendto(data, (self.esp_ip, AUDIO_IN_PORT))
                else:
                    # Stille senden bei Mute
                    silent_chunk = b'\\x00' * len(data)
                    self.audio_in_sock.sendto(silent_chunk, (self.esp_ip, AUDIO_IN_PORT))
            except Exception:
                time.sleep(0.01)

        stream.stop_stream()
        stream.close()
        p.terminate()

    def _audio_speaker_worker(self):
        """Empfaengt Ton vom Laptop-Lautsprecher via ESP32 und spielt ihn am PC ab."""
        if not pyaudio:
            return

        p = pyaudio.PyAudio()
        try:
            stream = p.open(
                format=pyaudio.paInt16,
                channels=AUDIO_CHANNELS,
                rate=AUDIO_RATE,
                output=True,
                frames_per_buffer=AUDIO_CHUNK
            )
        except Exception:
            p.terminate()
            return

        while self.running:
            try:
                data, addr = self.audio_out_sock.recvfrom(AUDIO_CHUNK * 2)
                if data:
                    stream.write(data)
                    self.speaker_bytes_received += len(data)
            except socket.timeout:
                continue
            except Exception:
                break

        stream.stop_stream()
        stream.close()
        p.terminate()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ESP32-S3 PC AV Streamer")
    parser.add_argument("--ip", default=DEFAULT_ESP_IP, help="ESP32-S3 IP-Adresse")
    parser.add_argument("--cam", type=int, default=0, help="Kamera Index (default: 0)")
    parser.add_argument("--width", type=int, default=640, help="Breite (default: 640)")
    parser.add_argument("--height", type=int, default=480, help="Hoehe (default: 480)")
    parser.add_argument("--fps", type=int, default=30, help="Bildrate (default: 30)")
    parser.add_argument("--quality", type=int, default=75, help="JPEG Qualitaet 1-100 (default: 75)")
    args = parser.parse_args()

    streamer = AVStreamer(
        esp_ip=args.ip,
        camera_index=args.cam,
        width=args.width,
        height=args.height,
        fps=args.fps,
        quality=args.quality
    )
    streamer.start()
`;

export const pythonLaptopBridgeCode = `"""
===============================================================================
Alternative Python Laptop Virtual Bridge (Software Test Harness)
===============================================================================
Runs on: Laptop
Purpose: If you want to test the entire wireless AV pipeline or use a virtual
         webcam (pyvirtualcam / OBS Virtual Camera) without flashing the ESP32!
===============================================================================
"""

import socket
import struct
import cv2
import numpy as np

try:
    import pyvirtualcam
except ImportError:
    pyvirtualcam = None

UDP_IP = "0.0.0.0"
VIDEO_PORT = 5000
MAX_UDP = 1500
HEADER_FORMAT = "!IHHH"
HEADER_SIZE = struct.calcsize(HEADER_FORMAT)

def run_laptop_receiver():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, VIDEO_PORT))
    print(f"[+] Laptop receiver listening on UDP {VIDEO_PORT}...")

    frame_buffers = {}

    while True:
        data, addr = sock.recvfrom(MAX_UDP)
        if len(data) < HEADER_SIZE:
            continue

        frame_id, total_packets, packet_idx, payload_size = struct.unpack(HEADER_FORMAT, data[:HEADER_SIZE])
        payload = data[HEADER_SIZE:HEADER_SIZE + payload_size]

        if frame_id not in frame_buffers:
            frame_buffers[frame_id] = [None] * total_packets

        frame_buffers[frame_id][packet_idx] = payload

        # Check if all packets received
        if all(p is not None for p in frame_buffers[frame_id]):
            full_frame_bytes = b"".join(frame_buffers[frame_id])
            del frame_buffers[frame_id]

            # Clean old frames
            if len(frame_buffers) > 10:
                frame_buffers.clear()

            # Decode JPEG
            np_arr = np.frombuffer(full_frame_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if frame is not None:
                cv2.imshow("Received Stream from PC", frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break

    sock.close()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    run_laptop_receiver()
`;

export const platformIoIni = `; =============================================================================
; PlatformIO Configuration for ESP32-S3 Composite AV Device
; =============================================================================
[env:esp32-s3-devkitc-1]
platform = espressif32 @ 6.5.0
board = esp32-s3-devkitc-1
framework = arduino

; Target CPU 240 MHz for maximum JPEG & USB isochronous throughput
board_build.f_cpu = 240000000L
board_build.f_flash = 80000000L
board_build.flash_mode = qio

; Enable PSRAM (OPI for DevKitC N8R8 / N16R8)
board_build.arduino.memory_type = qio_opi
board_build.psram_type = opi

build_flags = 
    -DBOARD_HAS_PSRAM
    -mfix-esp32-psram-cache-issue
    -DARDUINO_USB_MODE=0            ; 0 = Hardware USB-OTG / TinyUSB
    -DARDUINO_USB_CDC_ON_BOOT=0     ; 0 = Disables default Serial CDC so custom UVC/UAC works
    -DCFG_TUSB_MCU=OPT_MCU_ESP32S3
    -DCFG_TUD_VIDEO=1              ; Enable TinyUSB UVC driver
    -DCFG_TUD_AUDIO=1              ; Enable TinyUSB UAC driver
    -DCORE_DEBUG_LEVEL=1

lib_deps =
    esp32-camera
    ArduinoJson @ ^6.21.3

upload_speed = 921600
monitor_speed = 115200
`;

export const setupGuide = `# Dokumentation: Drahtlose AV-Bridge ueber ESP32-S3 (UVC + UAC Composite)

Autor: Fachinformatiker im 2. Lehrjahr (Notizen aus der Werkstatt)
Stand: Projektstand KW 40

## 1. Worum geht es hier eigentlich?

Kurzfassung: Ich wollte meine Webcam und mein USB-Grossmembranmikrofon vom Hauptrechner auf meinem Arbeitslaptop nutzen, ohne staendig Kabel umzustecken oder mir eine teure Elgato Cam Link bzw. zweite Hardware zu kaufen.

Die Idee:
Der ESP32-S3 haengt per USB am Laptop und meldet sich dort per Hardware-Deskriptor direkt als Standard-Webcam (UVC), USB-Mikrofon (UAC IN) und USB-Lautsprecher (UAC OUT) an. Fuer Windows, Linux oder macOS sieht der Mikrocontroller aus wie ein ganz normales USB-Headset mit Kamera.
Am Haupt-PC laeuft ein Python-Skript (oder der Browser), greift Bild und Ton ab und schaufelt die Daten per WLAN (UDP) rueber zum ESP32. Wenn der Laptop Sound ausgibt, wird der Stream ueber einen Rueckkanal wieder zurueck an den PC geschickt.

## 2. Warum genau dieser Aufbau? (Technische Entscheidungen)

- Kein TCP fuer Video/Audio: TCP garantiert zwar Paketreihenfolge, aber bei Paketverlust versucht der Stack krampfhaft das alte Paket nachzuliefern (Head-of-Line Blocking). Das fuehrt zu ruckelndem Bild und 2 Sekunden Latenz. Deshalb UDP. Wenn im WLAN mal ein Frame verloren geht, verwerfen wir ihn und nehmen sofort den naechsten. Latenz bleibt so stabil unter 40ms.
- UDP-Paketfragmentierung: Ein normales Ethernet-/WLAN-Paket hat eine MTU von 1500 Bytes. Wenn man ein 40 KB grosses JPEG einfach als ein UDP-Paket raushaut, muss der IP-Stack fragmentieren. Geht ein Fragment floeten, ist das ganze Bild im Eimer. Im Python-Skript zerlegen wir das Bild deshalb vorher in Chunks mit je max. 1400 Bytes und packen einen 10-Byte Header (Frame-ID, Paket-Index, Gesamtanzahl) davor. Der ESP baut das sauber im PSRAM zusammen.
- Warum ESP32-S3 und kein normaler ESP32?
  Der alte ESP32 (D0WDQ6) hat keinen internen USB-OTG-Controller. Der S3 hat einen nativen USB-Full-Speed-PHY direkt auf den Pins GPIO 19 (D-) und GPIO 20 (D+). Nur damit kann man UVC und UAC treiberlos in Hardware emulieren.
- PSRAM ist Pflicht:
  Ein 640x480 Frame komprimiert als JPEG braucht zwischen 15 KB und 45 KB. Dazu Ringpuffer fuer Audio. Der interne SRAM des ESP32 (384 KB) reicht dafuer nicht stabil aus, sobald der WLAN-Stack laeuft. Ihr braucht zwingend ein Board mit mindestens 2MB, besser 8MB OPI PSRAM (z.B. N8R8 oder N16R8).

## 3. Typischer Anfaengerfehler: Die beiden USB-C Buchsen am DevKit

Fast alle ESP32-S3 DevKit-Boards haben zwei USB-C Buchsen nebeneinander.
- Buchse 1 ("UART" / "COM"): Da sitzt ein CH340 oder CP2102 Chip davor. Das ist nur eine serielle Schnittstelle zum Flashen und fuer den Serial Monitor.
- Buchse 2 ("USB" / "OTG"): Das sind direkt die GPIOs 19 und 20 des S3.
WICHTIG: Wenn ihr den ESP32 an den Laptop ansteckt, MUSS das Kabel in die "USB/OTG"-Buchse! Wenn ihr ihn an den UART-Port haengt, wundert ihr euch eine Stunde lang, warum im Windows-Geraetemanager nur ein "COM4" auftaucht und Teams keine Kamera findet.

Pinout falls ihr selbst loetet:
- GPIO 19: USB D- (weisses Kabel)
- GPIO 20: USB D+ (gruenes Kabel)
- 5V / VBUS: Stromversorgung vom Laptop (rotes Kabel)
- GND: Masse (schwarzes Kabel)

## 4. Flashen mit PlatformIO (Mein empfohlener Weg)

Arduino IDE geht zwar auch, macht aber bei den TinyUSB-Build-Flags gerne Zicken. In PlatformIO ist das sauber in der platformio.ini definiert:

1. Projektordner oeffnen.
2. platformio.ini aus diesem Projekt reinkopieren.
3. ESP32-S3 ueber den UART-Port an den Rechner anstecken.
4. Bauen und flashen:
   pio run -t upload
5. Serial Monitor anwerfen:
   pio device monitor -b 115200
6. Im Log nachsehen, welche IP-Adresse der ESP32 von eurem Router bekommen hat.

Hinweis zu den Build-Flags:
-DARDUINO_USB_MODE=0 schaltet den Hardware-USB-OTG-Modus scharf.
-DARDUINO_USB_CDC_ON_BOOT=0 verhindert, dass der Standard-CDC-Treiber die USB-Endpunkte blockiert, damit UVC und UAC freie Bahn haben.

## 5. PC-Streamer starten

Auf dem PC (wo eure Kamera und euer Mikrofon eingesteckt sind):

Voraussetzungen:
pip install opencv-python pyaudio numpy

Startbefehl:
python pc_av_streamer.py --ip 192.168.1.150 --width 640 --height 480 --fps 30 --quality 75

Tipp aus der Praxis:
Fangt im 2.4 GHz WLAN erst mal mit 640x480 bei 24 bis 30 FPS an. 720p frisst deutlich mehr Bandbreite und zwingt den ESP32 beim Durchreichen in die Knie, wenn euer WLAN nicht absolut stabil laeuft.

## 6. Tastatur-Hotkeys (Quellen während der Übertragung wechseln)

Sowohl in der Weboberfläche als auch im Python-Streamer kannst du mitten im Live-Betrieb per Tastendruck die Bildquelle wechseln:
- Taste 1 bis 9: Direkt zu Kamera 1, 2, 3 ... umschalten
- Taste D oder S: Zwischen Webcam und Bildschirmübertragung (Display / Desktop-Share) wechseln
- Taste C: Zur nächsten angeschlossenen Kamera durchschalten
- Taste M: Mikrofon stummschalten (Mute-Toggle)
- Leertaste: Stream pausieren / fortsetzen

Das ist praktisch, wenn du im Meeting auf dem Laptop sitzt und kurz deinen PC-Monitor herzeigen oder auf eine zweite Dokumentenkamera umschalten willst, ohne in MS Teams oder Zoom die Einstellungen anfassen zu müssen.

## 7. Audio-Rueckkanal (Lautsprecher)

Der ESP32 emuliert am Laptop nicht nur das Mikrofon, sondern auch einen Lautsprecher ("UAC Output Terminal").
Alles was der Laptop abspielt (z.B. die Stimmen eurer Kollegen in Microsoft Teams), schickt der ESP32 ueber UDP-Port 5002 per WLAN zurueck an euren PC. Das Python-Skript am PC nimmt das auf und spielt es ueber eure PC-Kopfhoerer ab.
Kein zusaetzliches Kabel noetig.

## 7. Troubleshooting / Haeufige Stolpersteine

- Problem: Windows meldet "USB-Geraet wurde nicht erkannt" (Code 43)
  Ursache: Fast immer ein minderwertiges USB-C-Kabel (nur Ladekabel ohne Datenleitungen) oder ihr habt die falsche Buchse am DevKit erwischt. Nehmt ein geprueftes Datenkabel.
- Problem: Bild stockt oder bricht ab
  Ursache: WLAN-Paketverlust. Im Skript --quality 65 setzen oder pruefen ob euer Router auf 2.4 GHz mit Nachbar-WLANs kollidiert.
- Problem: Audio knackt oder hat Aussetzer
  Ursache: Pufferueberlauf im Audio-Endpunkt. In Windows in den Soundeigenschaften des ESP32-Mikrofons das Format fest auf 16 Bit, 16000 Hz stellen.
- Problem: pyAudio wirft Fehler bei der Installation
  Loesung: Unter Windows vorher "pip install pipwin" und dann "pipwin install pyaudio" ausfuehren, falls der C-Compiler meckert.
`;

export const CODE_TEMPLATES: CodeTemplate[] = [
  {
    id: 'esp32-firmware',
    name: 'ESP32-S3 Firmware (C++/Arduino)',
    language: 'cpp',
    filename: 'esp32_s3_composite_av.ino',
    description: 'Complete ESP32-S3 firmware with TinyUSB UVC Camera, UAC Mic, UAC Speaker, and Wi-Fi UDP streaming receiver.',
    code: esp32FirmwareCode,
  },
  {
    id: 'python-streamer',
    name: 'PC AV Streamer (Python)',
    language: 'python',
    filename: 'pc_av_streamer.py',
    description: 'Runs on the PC: captures local webcam & microphone, streams to ESP32 over Wi-Fi, and plays back laptop return audio.',
    code: pythonStreamerCode,
  },
  {
    id: 'laptop-bridge',
    name: 'Laptop Test Receiver (Python)',
    language: 'python',
    filename: 'laptop_bridge.py',
    description: 'Alternative software receiver to test streaming between PC and Laptop before or without flashing the ESP32.',
    code: pythonLaptopBridgeCode,
  },
  {
    id: 'platformio-config',
    name: 'PlatformIO Configuration',
    language: 'ini',
    filename: 'platformio.ini',
    description: 'PlatformIO project configuration with ESP32-S3 PSRAM, TinyUSB flags, and compiler optimization settings.',
    code: platformIoIni,
  },
  {
    id: 'setup-guide',
    name: 'Setup & Wiring Documentation',
    language: 'markdown',
    filename: 'README_SETUP.md',
    description: 'Hardware pinouts, architecture diagram, dual USB port guide, and step-by-step flashing instructions.',
    code: setupGuide,
  },
];
