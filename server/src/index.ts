import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { authRouter } from './auth.ts';
import { botsRouter } from './bots.ts';
import { chatRouter } from './chat.ts';
import { migrate } from './migrate.ts';
import { startWorker } from './worker.ts';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(express.json({ limit: '32kb' })); // room for a 4,000-character chat message
app.use('/api/auth', authRouter);
app.use('/api/bots', botsRouter);
app.use('/api/bots', chatRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

await migrate();
startWorker();

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
