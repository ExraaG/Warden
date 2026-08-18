import path from 'path';

export interface AppConfig {
  wardenApiKey: string;
  port: number;
  timezone: string;
  dataDir: string;
  javaPath: string;
  defaultJvmRam: string;
  devFixtureMode: boolean;
}

export const config: AppConfig = {
  wardenApiKey: process.env.WARDEN_API_KEY || 'warden_secret_key_change_me',
  port: parseInt(process.env.PORT || '8989', 10),
  timezone: process.env.TZ || 'Europe/Vienna',
  dataDir: process.env.DATA_DIR || path.join(process.cwd(), 'data'),
  javaPath: process.env.JAVA_PATH || 'java',
  defaultJvmRam: process.env.DEFAULT_JVM_RAM || '4G',
  devFixtureMode: process.env.DEV_FIXTURE_MODE === 'true',
};

