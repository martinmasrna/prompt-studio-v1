// Health check route — used by the frontend to confirm the backend is reachable on startup.
import { Router } from 'express';
import db from '../db';

const router = Router();

router.get('/', (_req, res) => {
  // Run a trivial DB query so the health check also validates the database is open
  const row = db.get('SELECT 1 AS ok') as { ok: number };
  res.json({ status: 'ok', db: row.ok === 1 });
});

export default router;
