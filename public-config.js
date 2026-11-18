function envOrNull(name) {
  const val = process.env[name];
  if (typeof val !== 'string') return null;
  let trimmed = val.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  if (!trimmed || trimmed === 'COLE_AQUI') return null;
  return trimmed;
}

export function getPublicConfig() {
  return {
    firebase: {
      apiKey: envOrNull('FIREBASE_API_KEY') || 'COLE_AQUI',
      authDomain: envOrNull('FIREBASE_AUTH_DOMAIN') || 'COLE_AQUI',
      projectId: envOrNull('FIREBASE_PROJECT_ID') || 'COLE_AQUI',
      storageBucket: envOrNull('FIREBASE_STORAGE_BUCKET') || 'COLE_AQUI',
      messagingSenderId: envOrNull('FIREBASE_MESSAGING_SENDER_ID') || 'COLE_AQUI',
      appId: envOrNull('FIREBASE_APP_ID') || 'COLE_AQUI',
      measurementId: envOrNull('FIREBASE_MEASUREMENT_ID') || 'COLE_AQUI'
    },
    cloudinary: {
      cloudName: envOrNull('CLOUDINARY_CLOUD_NAME') || 'COLE_AQUI',
      uploadPreset: envOrNull('CLOUDINARY_UPLOAD_PRESET') || 'COLE_AQUI'
    },
    whatsappNumber: envOrNull('WHATSAPP_NUMBER') || '5521999999999',
    phoneDisplay: envOrNull('PHONE_DISPLAY') || '(21) 99999-9999',
    instagramUrl: envOrNull('INSTAGRAM_URL') || 'https://www.instagram.com/actionn.film/'
  };
}

export function sendPublicConfig(res) {
  const envOverrides = {
    firebase: {
      apiKey: envOrNull('FIREBASE_API_KEY'),
      authDomain: envOrNull('FIREBASE_AUTH_DOMAIN'),
      projectId: envOrNull('FIREBASE_PROJECT_ID'),
      storageBucket: envOrNull('FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: envOrNull('FIREBASE_MESSAGING_SENDER_ID'),
      appId: envOrNull('FIREBASE_APP_ID'),
      measurementId: envOrNull('FIREBASE_MEASUREMENT_ID')
    },
    cloudinary: {
      cloudName: envOrNull('CLOUDINARY_CLOUD_NAME'),
      uploadPreset: envOrNull('CLOUDINARY_UPLOAD_PRESET')
    },
    whatsappNumber: envOrNull('WHATSAPP_NUMBER'),
    phoneDisplay: envOrNull('PHONE_DISPLAY'),
    instagramUrl: envOrNull('INSTAGRAM_URL')
  };
  const defaults = getPublicConfig();

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(
    `(function () {\n` +
      `  var prev = (window.ACTION_CONFIG && typeof window.ACTION_CONFIG === 'object') ? window.ACTION_CONFIG : {};\n` +
      `  var over = ${JSON.stringify(envOverrides)};\n` +
      `  var defs = ${JSON.stringify(defaults)};\n` +
      `  function valid(v) { return typeof v === 'string' && v.trim() !== '' && v.trim() !== 'COLE_AQUI'; }\n` +
      `  function pick(o, p, d) { return valid(o) ? o.trim() : (valid(p) ? p.trim() : d); }\n` +
      `  var pf = (prev.firebase && typeof prev.firebase === 'object') ? prev.firebase : {};\n` +
      `  var pc = (prev.cloudinary && typeof prev.cloudinary === 'object') ? prev.cloudinary : {};\n` +
      `  window.ACTION_CONFIG = {\n` +
      `    firebase: {\n` +
      `      apiKey: pick(over.firebase.apiKey, pf.apiKey, defs.firebase.apiKey),\n` +
      `      authDomain: pick(over.firebase.authDomain, pf.authDomain, defs.firebase.authDomain),\n` +
      `      projectId: pick(over.firebase.projectId, pf.projectId, defs.firebase.projectId),\n` +
      `      storageBucket: pick(over.firebase.storageBucket, pf.storageBucket, defs.firebase.storageBucket),\n` +
      `      messagingSenderId: pick(over.firebase.messagingSenderId, pf.messagingSenderId, defs.firebase.messagingSenderId),\n` +
      `      appId: pick(over.firebase.appId, pf.appId, defs.firebase.appId),\n` +
      `      measurementId: pick(over.firebase.measurementId, pf.measurementId, defs.firebase.measurementId)\n` +
      `    },\n` +
      `    cloudinary: {\n` +
      `      cloudName: pick(over.cloudinary.cloudName, pc.cloudName, defs.cloudinary.cloudName),\n` +
      `      uploadPreset: pick(over.cloudinary.uploadPreset, pc.uploadPreset, defs.cloudinary.uploadPreset)\n` +
      `    },\n` +
      `    whatsappNumber: pick(over.whatsappNumber, prev.whatsappNumber, defs.whatsappNumber),\n` +
      `    phoneDisplay: pick(over.phoneDisplay, prev.phoneDisplay, defs.phoneDisplay),\n` +
      `    instagramUrl: pick(over.instagramUrl, prev.instagramUrl, defs.instagramUrl)\n` +
      `  };\n` +
      `})();`
  );
}
