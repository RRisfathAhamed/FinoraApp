import { Capacitor, registerPlugin } from '@capacitor/core';

export interface BiometricAvailability {
  available: boolean;
  biometric: boolean;
  credential: boolean;
  reason?: string;
}

export interface BiometricResult {
  success: boolean;
  code?: string;
  message?: string;
}

interface FinoraBiometricPlugin {
  isAvailable(): Promise<BiometricAvailability>;
  authenticate(): Promise<BiometricResult>;
}

const FinoraBiometric = registerPlugin<FinoraBiometricPlugin>('FinoraBiometric');

const WEB_UNAVAILABLE: BiometricAvailability = {
  available: false,
  biometric: false,
  credential: false,
  reason: 'App lock is available in the Android app.',
};

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  if (!Capacitor.isNativePlatform()) return WEB_UNAVAILABLE;
  try {
    return await FinoraBiometric.isAvailable();
  } catch (error) {
    return {
      available: false,
      biometric: false,
      credential: false,
      reason: (error as Error).message || 'Biometric authentication is unavailable.',
    };
  }
}

export async function authenticateWithBiometrics(): Promise<BiometricResult> {
  if (!Capacitor.isNativePlatform()) {
    return { success: false, code: 'UNAVAILABLE', message: WEB_UNAVAILABLE.reason };
  }
  try {
    return await FinoraBiometric.authenticate();
  } catch (error) {
    return {
      success: false,
      code: 'UNAVAILABLE',
      message: (error as Error).message || 'Authentication could not start.',
    };
  }
}
