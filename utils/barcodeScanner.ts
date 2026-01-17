// FILE: utils/barcodeScanner.ts
import { Html5Qrcode } from 'html5-qrcode';

export interface BarcodeScannerConfig {
  onSuccess: (decodedText: string) => void;
  onError?: (error: string) => void;
  fps?: number;
  qrbox?: number;
}

export class BarcodeScanner {
  private html5QrCode: Html5Qrcode | null = null;
  private isScanning: boolean = false;
  private lastScannedCode: string = '';
  private lastScanTime: number = 0;
  private readonly DEBOUNCE_TIME = 1000; // Prevent duplicate scans within 1 second

  constructor(private elementId: string) {}

  async start(config: BarcodeScannerConfig): Promise<void> {
    if (this.isScanning) {
      console.warn('Scanner is already running');
      return;
    }

    try {
      this.html5QrCode = new Html5Qrcode(this.elementId);
      
      const qrCodeSuccessCallback = (decodedText: string) => {
        const now = Date.now();
        
        // Debounce: prevent duplicate scans
        if (decodedText === this.lastScannedCode && now - this.lastScanTime < this.DEBOUNCE_TIME) {
          return;
        }

        this.lastScannedCode = decodedText;
        this.lastScanTime = now;
        
        // Play beep sound
        this.playBeep();
        
        // Call the success callback
        config.onSuccess(decodedText);
      };

      const qrCodeErrorCallback = (errorMessage: string) => {
        // Don't call error callback for every frame without barcode
        if (!errorMessage.includes('NotFoundException')) {
          config.onError?.(errorMessage);
        }
      };

      await this.html5QrCode.start(
        { facingMode: 'environment' }, // Use back camera
        {
          fps: config.fps || 10,
          qrbox: config.qrbox || 250,
        },
        qrCodeSuccessCallback,
        qrCodeErrorCallback
      );

      this.isScanning = true;
    } catch (error) {
      console.error('Failed to start scanner:', error);
      config.onError?.(`Failed to start camera: ${error}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.html5QrCode || !this.isScanning) {
      return;
    }

    try {
      await this.html5QrCode.stop();
      this.isScanning = false;
      this.html5QrCode = null;
    } catch (error) {
      console.error('Failed to stop scanner:', error);
    }
  }

  isActive(): boolean {
    return this.isScanning;
  }

  private playBeep(): void {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // 800 Hz beep
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      console.warn('Failed to play beep:', error);
    }
  }
}
