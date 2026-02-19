import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import exercisesRouter from './routes/exercises';
import personnelGroupsRouter from './routes/personnelGroups';
import costLinesRouter from './routes/costLines';
import ratesRouter from './routes/rates';

dotenv.config();

const app = express();
export const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/v1/exercises', exercisesRouter);
app.use('/api/v1', personnelGroupsRouter);
app.use('/api/v1', costLinesRouter);
app.use('/api/v1/rates', ratesRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend in production
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.get('*', (_req, res) => {
  const indexPath = path.join(publicPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`China Tracker API running on port ${PORT}`);
});
