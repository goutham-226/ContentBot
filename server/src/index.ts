import express from 'express';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { authRouter } from './auth.ts';
import { botsRouter } from './bots.ts';
import { chatRouter } from './chat.ts';
import { migrate } from './migrate.ts';
import { startWorker, stopWorker } from './worker.ts';
import { warmUpEmbeddings } from './embeddings.ts';

const app = express();
const port = Number(process.env.PORT ?? 4000);

// Behind a reverse proxy, TRUST_PROXY makes req.ip the real client's address
// (for rate limits): the number of proxies in front (e.g. 1), or a list of
// their addresses / subnets (e.g. "loopback, 10.0.0.0/8"). Unset: no proxy.
const { TRUST_PROXY } = process.env;
if (TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY);

// Security headers. The API only serves JSON and media, never pages, so its
// CSP allows nothing (media routes set their own sandboxed CSP).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: { defaultSrc: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"], frameAncestors: ["'none'"] },
  },
}));
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
warmUpEmbeddings();

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

// Hand running jobs back to the queue before exiting (deploys, dev reloads).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    console.log(`${signal}: returning running jobs to the queue…`);
    server.close();
    stopWorker()
      .catch((err: unknown) => console.error('Worker shutdown failed:', err))
      .finally(() => process.exit(0));
  });
}
