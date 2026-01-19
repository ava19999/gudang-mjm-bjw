// FILE: utils/cameraScanner.ts
// Camera barcode/QR code scanner utility using html5-qrcode

import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

let html5QrCode: Html5Qrcode | null = null;

export interface ScannerConfig {
  fps?: number;
  qrbox?: number | { width: number; height: number };
  aspectRatio?: number;
}

/**
 * Initialize camera scanner
 */
export const initCamera = async (
  elementId: string,
  onScanSuccess: (decodedText: string, decodedResult: any) => void,
  onScanFailure?: (error: string) => void,
  config?: ScannerConfig
): Promise<{ success: boolean; message: string }> => {
  try {
    // Check if already initialized
    if (html5QrCode && html5QrCode.getState() === 2) {
      return {
        success: false,
        message: 'Scanner sudah berjalan'
      };
    }

    // Create new instance
    html5QrCode = new Html5Qrcode(elementId, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E
      ],
      verbose: false
    });

    const defaultConfig = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0
    };

    const finalConfig = { ...defaultConfig, ...config };

    // Start scanning
    await html5QrCode.start(
      { facingMode: "environment" }, // Use back camera
      {
        fps: finalConfig.fps,
        qrbox: finalConfig.qrbox,
        aspectRatio: finalConfig.aspectRatio
      },
      onScanSuccess,
      onScanFailure
    );

    return {
      success: true,
      message: 'Kamera berhasil diaktifkan'
    };
  } catch (error: any) {
    console.error('Error initializing camera:', error);
    return {
      success: false,
      message: error.message || 'Gagal mengaktifkan kamera'
    };
  }
};

/**
 * Stop camera scanner
 */
export const stopCamera = async (): Promise<{ success: boolean; message: string }> => {
  try {
    if (!html5QrCode) {
      return {
        success: false,
        message: 'Scanner belum diinisialisasi'
      };
    }

    if (html5QrCode.getState() === 2) {
      await html5QrCode.stop();
      html5QrCode.clear();
    }

    return {
      success: true,
      message: 'Kamera berhasil dihentikan'
    };
  } catch (error: any) {
    console.error('Error stopping camera:', error);
    return {
      success: false,
      message: error.message || 'Gagal menghentikan kamera'
    };
  }
};

/**
 * Request camera permission
 */
export const requestCameraPermission = async (): Promise<{ 
  success: boolean; 
  message: string;
  cameras?: any[];
}> => {
  try {
    const cameras = await Html5Qrcode.getCameras();
    
    if (!cameras || cameras.length === 0) {
      return {
        success: false,
        message: 'Tidak ada kamera yang terdeteksi'
      };
    }

    return {
      success: true,
      message: `${cameras.length} kamera terdeteksi`,
      cameras
    };
  } catch (error: any) {
    console.error('Error requesting camera permission:', error);
    return {
      success: false,
      message: error.message || 'Gagal mengakses kamera. Pastikan izin kamera sudah diberikan.'
    };
  }
};

/**
 * Check if camera is currently scanning
 */
export const isCameraScanning = (): boolean => {
  return html5QrCode?.getState() === 2;
};

/**
 * Pause camera scanner
 */
export const pauseCamera = async (): Promise<{ success: boolean; message: string }> => {
  try {
    if (!html5QrCode || html5QrCode.getState() !== 2) {
      return {
        success: false,
        message: 'Kamera tidak sedang berjalan'
      };
    }

    await html5QrCode.pause();

    return {
      success: true,
      message: 'Kamera dijeda'
    };
  } catch (error: any) {
    console.error('Error pausing camera:', error);
    return {
      success: false,
      message: error.message || 'Gagal menjeda kamera'
    };
  }
};

/**
 * Resume camera scanner
 */
export const resumeCamera = async (): Promise<{ success: boolean; message: string }> => {
  try {
    if (!html5QrCode || html5QrCode.getState() !== 3) {
      return {
        success: false,
        message: 'Kamera tidak dalam keadaan dijeda'
      };
    }

    await html5QrCode.resume();

    return {
      success: true,
      message: 'Kamera dilanjutkan'
    };
  } catch (error: any) {
    console.error('Error resuming camera:', error);
    return {
      success: false,
      message: error.message || 'Gagal melanjutkan kamera'
    };
  }
};

/**
 * Get scanner state
 * 0 = NOT_STARTED, 1 = STARTING, 2 = SCANNING, 3 = PAUSED
 */
export const getScannerState = (): number => {
  return html5QrCode?.getState() ?? 0;
};

/**
 * Cleanup scanner instance
 */
export const cleanupScanner = async (): Promise<void> => {
  try {
    if (html5QrCode) {
      if (html5QrCode.getState() === 2 || html5QrCode.getState() === 3) {
        await html5QrCode.stop();
      }
      // Cek apakah elemen scanner masih ada sebelum clear
      try {
        const el = html5QrCode.getState && document.getElementById((html5QrCode as any).elementId);
        if (el) {
          await html5QrCode.clear();
        }
      } catch (err) {
        // Jika gagal clear karena node sudah tidak ada, abaikan
        // console.warn('html5QrCode.clear() error:', err);
      }
      html5QrCode = null;
    }
  } catch (error) {
    // Jangan crash, hanya log
    // console.error('Error cleaning up scanner:', error);
  }
};
