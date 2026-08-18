import path from 'path';

export interface AppConfig {
  craftyUrl: string;
  craftyApiKey: string;
  wardenApiKey: string;
  port: number;
  timezone: string;
  dataDir: string;
  devFixtureMode: boolean;
}

export const config: AppConfig = {
  craftyUrl: process.env.CRAFTY_URL || 'https://localhost:8443',
  craftyApiKey: process.env.CRAFTY_API_KEY || '',
  wardenApiKey: process.env.WARDEN_API_KEY || 'warden_secret_key_change_me',
  port: parseInt(process.env.PORT || '8989', 10),
  timezone: process.env.TZ || 'Europe/Vienna',
  dataDir: process.env.DATA_DIR || path.join(process.cwd(), 'data'),
  devFixtureMode: process.env.DEV_FIXTURE_MODE === 'true',
};
