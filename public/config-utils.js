export const FIREBASE_VERSION = '11.4.0';

export function isDemoAllowed() {
  const host = typeof location !== 'undefined' ? location.hostname : '';
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function isFirebaseConfigReady(config) {
  if (!config || !config.firebase) return false;
  const fb = config.firebase;
  return [fb.apiKey, fb.authDomain, fb.projectId, fb.appId].every(
    (val) => typeof val === 'string' && val.trim() !== '' && val.trim() !== 'COLE_AQUI'
  );
}

export function isCloudinaryConfigReady(config) {
  if (!config || !config.cloudinary) return false;
  const cl = config.cloudinary;
  return [cl.cloudName, cl.uploadPreset].every(
    (val) => typeof val === 'string' && val.trim() !== '' && val.trim() !== 'COLE_AQUI'
  );
}
