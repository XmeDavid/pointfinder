import dotenv from 'dotenv';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const runId = `${Date.now()}-${uuidv4().slice(0, 8)}`;
const defaultBaseUrl = 'https://localhost';

export const config = {
  runId,
  baseUrl: process.env.BASE_URL || defaultBaseUrl,
  operatorEmail: process.env.OPERATOR_EMAIL || '',
  operatorPassword: process.env.OPERATOR_PASSWORD || '',
  iosAppId: process.env.IOS_APP_ID || 'com.prayer.pointfinder',
  androidAppId: process.env.ANDROID_APP_ID || 'com.prayer.pointfinder',
};
