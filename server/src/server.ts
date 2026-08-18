import express from 'express';
import path from 'path';
import { parse } from 'url';
import next from 'next';
import { config } from './config.js';
import { apiRouter } from './routes/api.js';
import { updateJobRunner } from './jobs/cron.js';

const appDir = typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..') : path.resolve(process.cwd(), 'server');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev, dir: appDir });
const nextHandler = nextApp.getRequestHandler();

async function bootstrap() {
  await nextApp.prepare();
  const app = express();

  app.use(express.json({ limit: '150mb' }));
  app.use(express.urlencoded({ limit: '150mb', extended: true }));

  // Mount API router under /api
  app.use('/api', apiRouter);

  // Serve static assets from public folder
  app.use(express.static(path.join(appDir, 'public')));

  // In production, serve Next.js pre-built static assets directly
  if (!dev) {
    app.use('/_next/static', express.static(path.join(appDir, '.next/static')));
  }

  // Serve Next.js web application for all routes
  app.all('*', (req, res) => {
    return nextHandler(req, res);
  });

  // Start 4 AM update cron job runner
  updateJobRunner.initCron();

  app.listen(config.port, () => {
    console.log(`=======================================================`);
    console.log(`   WARDEN SERVER IS RUNNING ON PORT http://localhost:${config.port}`);
    console.log(`   API Endpoint: http://localhost:${config.port}/api/v1`);
    console.log(`   Health Check: http://localhost:${config.port}/api/health`);
    console.log(`   Timezone:     ${config.timezone}`);
    console.log(`=======================================================`);
  });
}

bootstrap().catch((err) => {
  console.error('[Server] Fatal bootstrap error:', err);
  process.exit(1);
});
