import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import './services/passport';
import authRouter from './routes/auth';
import playlistsRouter from './routes/youtube';
import adminRouter from './routes/admin';
import dashboardRouter from './routes/dashboard';
import artistsRouter from './routes/artists';
import nowPlayingRouter from './routes/nowPlaying';
import playbackStateRouter from './routes/playbackState';
import { errorHandler } from './middleware/errorHandler';
import { resetStuckSyncs } from './services/syncService';
import { ensureDemoUser } from './services/demoUser';
import { loadSettings } from './services/settings';
import { isOnline, startConnectivityMonitor } from './services/connectivity';
import { startAudioAnalysisWorker } from './services/audioAnalysisWorker';
import { requireAuth } from './middleware/auth';

const app = express();

app.set('trust proxy', 2);
app.use(helmet());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
// Default 100kb is fine for every other route, but the admin CSV track
// import (backend/src/routes/admin.ts) can legitimately be a few MB for a
// large library — raised globally rather than per-route since the body is
// already consumed by the time a route-specific parser would run.
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/status', requireAuth, (_req, res) => {
  res.json({ online: isOnline() });
});

app.use('/api/auth', authRouter);
app.use('/api/playlists', playlistsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/artists', artistsRouter);
app.use('/api/now-playing', nowPlayingRouter);
app.use('/api/playback-state', playbackStateRouter);

app.use(errorHandler);

app.listen(config.port, '0.0.0.0', async () => {
  console.log(`[server] Backend listening on port ${config.port} (${config.nodeEnv})`);
  await loadSettings();
  await resetStuckSyncs();
  if (config.appEnv === 'dev') {
    await ensureDemoUser();
  } else {
    console.log(`[seed] Skipping demo user creation (APP_ENV=${config.appEnv})`);
  }
  startConnectivityMonitor();
  startAudioAnalysisWorker();
});

