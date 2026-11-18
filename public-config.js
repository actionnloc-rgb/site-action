export function getPublicConfig() {
  return {
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY || 'COLE_AQUI',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'COLE_AQUI',
      projectId: process.env.FIREBASE_PROJECT_ID || 'COLE_AQUI',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'COLE_AQUI',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || 'COLE_AQUI',
      appId: process.env.FIREBASE_APP_ID || 'COLE_AQUI',
      measurementId: process.env.FIREBASE_MEASUREMENT_ID || 'COLE_AQUI'
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'COLE_AQUI',
      uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || 'COLE_AQUI'
    },
    whatsappNumber: process.env.WHATSAPP_NUMBER || '5521999999999',
    phoneDisplay: process.env.PHONE_DISPLAY || '(21) 99999-9999',
    instagramUrl: process.env.INSTAGRAM_URL || 'https://www.instagram.com/actionn.film/'
  };
}

export function sendPublicConfig(res) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.end(`window.ACTION_CONFIG = ${JSON.stringify(getPublicConfig())};`);
}
