import { sendPublicConfig } from '../public-config.js';

export default function handler(_req, res) {
  sendPublicConfig(res);
}
