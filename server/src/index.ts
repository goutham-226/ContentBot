import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { authRouter } from './auth.ts';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(express.json({ limit: '10kb' }));
app.use('/api/auth', authRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
