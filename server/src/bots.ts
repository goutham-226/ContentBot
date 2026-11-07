import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { pool } from './db.ts';
import { currentUser, requireAuth } from './session.ts';
import {
  BOT_COLORS, BOT_NAME_MAX, CUSTOM_DESCRIPTION_MAX, CUSTOM_NAME_MAX, DEFAULT_VOICES, IDENTITY_PRESETS, MAX_IMAGE_BYTES,
  MAX_IMAGES, MAX_NICHES, NICHES, VOICES,
} from './catalog.ts';
import { draftCharacters, imageQueryFor } from './character.ts';
import { findReferenceImages } from './referenceImages.ts';

export const botsRouter = Router();
botsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES, fields: 1, fieldSize: 16 * 1024 },
});

const REFERENCE_IMAGE_COUNT = 4;
const CHARACTER_MAX = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BotRow = {
  id: string;
  name: string;
  color: string;
  niches: string[];
  identity_preset: string | null;
  identity_name: string;
  identity_description: string;
  character: string;
  character2: string;
  character_approved: boolean;
  voice: string;
  voice2: string;
  created_at: Date;
  images: {
    id: string;
    name: string;
    source_url: string | null;
    creator: string | null;
    license: string | null;
    ai_generated: boolean;
    asset: string | null;
  }[];
};

type Identity = { presetId: string | null; name: string; description: string };

function toDto(row: BotRow) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    niches: row.niches,
    identity: {
      presetId: row.identity_preset,
      name: row.identity_name,
      description: row.identity_description,
      custom: row.identity_preset === null,
    },
    images: row.images.map((img) => ({
      id: img.id,
      name: img.name,
      url: `/api/bots/${row.id}/images/${img.id}`,
      aiGenerated: img.ai_generated,
      asset: img.asset, // which part of the AI identity pack, if any
      // Only for images found online; uploads have no credit line.
      source: img.source_url
        ? { url: img.source_url, creator: img.creator ?? '', license: img.license ?? '' }
        : null,
    })),
    character: (() => {
      // Bots made before characters existed get a fresh draft.
      const [draft, draft2] = row.character
        ? [row.character, row.character2]
        : draftCharacters({
            name: row.name,
            niches: row.niches,
            presetId: row.identity_preset,
            identityName: row.identity_name,
            identityDescription: row.identity_description,
          });
      return { text: draft, second: draft2, approved: row.character_approved, voices: [row.voice, row.voice2] };
    })(),
    createdAt: row.created_at.toISOString(),
  };
}

// Content type from the file's first bytes; the client-supplied type isn't trusted.
function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  const head = buf.subarray(0, 12).toString('latin1');
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// [first character's voice, second character's voice]; missing ones get defaults.
function parseVoices(raw: unknown): [string, string] | string {
  if (raw === undefined) return [...DEFAULT_VOICES];
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 2) return 'Pick a voice for your character.';
  if (!raw.every((v): v is string => typeof v === 'string' && VOICES.has(v))) return 'Unknown voice.';
  return [raw[0], raw[1] ?? DEFAULT_VOICES[1]];
}

// Parses the "data" form field. Returns an error message or the clean values.
type BotInput = { name: string; color: string; voices: [string, string]; niches: string[]; identity: Identity };

function parseBotInput(raw: unknown): BotInput | string {
  let data: unknown;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : null;
  } catch {
    return 'Invalid request.';
  }
  if (!data || typeof data !== 'object') return 'Invalid request.';

  const name = 'name' in data && typeof data.name === 'string' ? data.name.trim() : '';
  if (!name) return 'Give your bot a name.';
  if (name.length > BOT_NAME_MAX) return `Bot names can be at most ${BOT_NAME_MAX} characters.`;
  const color = 'color' in data && typeof data.color === 'string' ? data.color : '';
  if (!BOT_COLORS.has(color)) return 'Pick a colour for your bot.';
  const voices = parseVoices('voices' in data ? data.voices : undefined);
  if (typeof voices === 'string') return voices;

  const niches = 'niches' in data && Array.isArray(data.niches) ? data.niches : [];
  if (niches.length < 1 || niches.length > MAX_NICHES) return `Pick between 1 and ${MAX_NICHES} niches.`;
  if (!niches.every((n): n is string => typeof n === 'string' && NICHES.has(n))) return 'Unknown niche.';
  if (new Set(niches).size !== niches.length) return 'Each niche can only be picked once.';

  const identityRaw = 'identity' in data ? data.identity : null;
  if (!identityRaw || typeof identityRaw !== 'object') return 'Pick a channel identity.';

  if ('presetId' in identityRaw && typeof identityRaw.presetId === 'string') {
    const preset = IDENTITY_PRESETS.get(identityRaw.presetId);
    if (!preset) return 'Unknown channel identity.';
    return { name, color, voices, niches, identity: { presetId: identityRaw.presetId, ...preset } };
  }

  const styleName =
    'name' in identityRaw && typeof identityRaw.name === 'string' ? identityRaw.name.trim() : '';
  const description =
    'description' in identityRaw && typeof identityRaw.description === 'string' ? identityRaw.description.trim() : '';
  if (!styleName) return 'Give your style a name.';
  if (styleName.length > CUSTOM_NAME_MAX) return `Style names can be at most ${CUSTOM_NAME_MAX} characters.`;
  if (description.length > CUSTOM_DESCRIPTION_MAX) {
    return `Descriptions can be at most ${CUSTOM_DESCRIPTION_MAX} characters.`;
  }
  return { name, color, voices, niches, identity: { presetId: null, name: styleName, description } };
}

const SELECT_BOTS = `
  SELECT b.id, b.name, b.color, b.niches, b.identity_preset, b.identity_name, b.identity_description,
         b.character, b.character2, b.character_approved, b.voice, b.voice2, b.created_at,
         COALESCE(
           json_agg(json_build_object(
             'id', i.id, 'name', i.filename, 'source_url', i.source_url, 'creator', i.creator, 'license', i.license,
             'ai_generated', i.ai_generated, 'asset', i.asset
           ) ORDER BY i.position)
             FILTER (WHERE i.id IS NOT NULL),
           '[]'
         ) AS images
    FROM bots b
    LEFT JOIN bot_images i ON i.bot_id = b.id`;

// GET /api/bots: the current user's bots, newest first (image metadata only).
botsRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query<BotRow>(
    `${SELECT_BOTS} WHERE b.user_id = $1 GROUP BY b.id ORDER BY b.created_at DESC`,
    [currentUser(res).id],
  );
  res.json({ bots: rows.map(toDto) });
});

// POST /api/bots: multipart form with a JSON "data" field and up to 10 "images".
botsRouter.post('/', upload.array('images', MAX_IMAGES), async (req, res) => {
  const parsed = parseBotInput(req.body?.data);
  if (typeof parsed === 'string') {
    res.status(400).json({ error: parsed });
    return;
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  type ImageToSave = {
    filename: string;
    contentType: string;
    data: Buffer;
    source: { url: string; creator: string; license: string } | null;
  };
  const images: ImageToSave[] = [];
  for (const file of files) {
    const contentType = sniffImageType(file.buffer);
    if (!contentType) {
      res.status(400).json({ error: `${file.originalname} isn’t a PNG, JPG, WEBP or GIF.` });
      return;
    }
    images.push({ filename: file.originalname.slice(0, 255), contentType, data: file.buffer, source: null });
  }

  if (parsed.identity.presetId === null && images.length === 0) {
    res.status(400).json({ error: 'Your own style needs at least one supporting image.' });
    return;
  }

  // Skipped uploading: find openly licensed references for the preset style instead.
  const query = images.length === 0 ? imageQueryFor(parsed.identity.presetId) : null;
  if (query) {
    for (const found of await findReferenceImages(query, REFERENCE_IMAGE_COUNT)) {
      const contentType = sniffImageType(found.data);
      if (!contentType) continue;
      images.push({
        filename: found.filename,
        contentType,
        data: found.data,
        source: { url: found.sourceUrl, creator: found.creator, license: found.license },
      });
    }
  }

  const [character, character2] = draftCharacters({
    name: parsed.name,
    niches: parsed.niches,
    presetId: parsed.identity.presetId,
    identityName: parsed.identity.name,
    identityDescription: parsed.identity.description,
  });

  const userId = currentUser(res).id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO bots
         (user_id, name, color, voice, voice2, niches, identity_preset, identity_name, identity_description, character, character2)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        userId,
        parsed.name,
        parsed.color,
        parsed.voices[0],
        parsed.voices[1],
        parsed.niches,
        parsed.identity.presetId,
        parsed.identity.name,
        parsed.identity.description,
        character,
        character2,
      ],
    );
    const botId = rows[0].id;

    for (const [position, img] of images.entries()) {
      await client.query(
        `INSERT INTO bot_images
           (bot_id, position, filename, content_type, size_bytes, data, source_url, creator, license)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          botId, position, img.filename, img.contentType, img.data.length, img.data,
          img.source?.url ?? null, img.source?.creator ?? null, img.source?.license ?? null,
        ],
      );
    }
    await client.query('COMMIT');

    const saved = await pool.query<BotRow>(`${SELECT_BOTS} WHERE b.id = $1 GROUP BY b.id`, [botId]);
    res.status(201).json({ bot: toDto(saved.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/bots/:botId/images/:imageId: the image bytes, only for the bot's owner.
botsRouter.get('/:botId/images/:imageId', async (req, res) => {
  const { botId, imageId } = req.params;
  if (!UUID_RE.test(botId) || !UUID_RE.test(imageId)) {
    res.status(404).end();
    return;
  }

  const { rows } = await pool.query<{ content_type: string; data: Buffer }>(
    `SELECT i.content_type, i.data
       FROM bot_images i JOIN bots b ON b.id = i.bot_id
      WHERE i.id = $1 AND b.id = $2 AND b.user_id = $3`,
    [imageId, botId, currentUser(res).id],
  );
  const image = rows[0];
  if (!image) {
    res.status(404).end();
    return;
  }

  res.set({
    'Content-Type': image.content_type,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600',
  });
  res.send(image.data);
});

// DELETE /api/bots/:botId: removes the bot with its images and messages.
botsRouter.delete('/:botId', async (req, res) => {
  const { botId } = req.params;
  const { rowCount } = UUID_RE.test(botId)
    ? await pool.query('DELETE FROM bots WHERE id = $1 AND user_id = $2', [botId, currentUser(res).id])
    : { rowCount: 0 };
  res.status(rowCount ? 204 : 404).end();
});

// PUT /api/bots/:botId/character: { text, second?, voices? } — saves the
// (possibly edited) characters (up to two) and their voices, and approves them.
botsRouter.put('/:botId/character', async (req, res) => {
  const { botId } = req.params;
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const second = typeof req.body?.second === 'string' ? req.body.second.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'Describe your character first.' });
    return;
  }
  if (text.length > CHARACTER_MAX || second.length > CHARACTER_MAX) {
    res.status(400).json({ error: `Characters can be at most ${CHARACTER_MAX} characters long.` });
    return;
  }
  const voices = req.body?.voices === undefined ? null : parseVoices(req.body.voices);
  if (typeof voices === 'string') {
    res.status(400).json({ error: voices });
    return;
  }
  const userId = currentUser(res).id;
  const { rowCount } = UUID_RE.test(botId)
    ? await pool.query(
        `UPDATE bots SET character = $1, character2 = $2, character_approved = true,
                voice = COALESCE($5, voice), voice2 = COALESCE($6, voice2)
          WHERE id = $3 AND user_id = $4`,
        [text, second, botId, userId, voices?.[0] ?? null, voices?.[1] ?? null],
      )
    : { rowCount: 0 };
  if (!rowCount) {
    res.status(404).json({ error: 'Bot not found.' });
    return;
  }
  // Draw whatever the identity pack is missing (character sheets, channel
  // images), kept for good. A no-op once everything exists.
  await pool.query(
    `INSERT INTO runs (bot_id, kind)
     SELECT $1, 'character'
      WHERE NOT EXISTS (SELECT 1 FROM runs WHERE bot_id = $1 AND kind = 'character' AND status IN ('queued', 'running'))
        AND (
          NOT EXISTS (SELECT 1 FROM bot_images WHERE bot_id = $1 AND asset = 'character_sheet' AND character_index = 0)
          OR ($2 <> '' AND NOT EXISTS (
            SELECT 1 FROM bot_images WHERE bot_id = $1 AND asset = 'character_sheet' AND character_index = 1))
          OR NOT EXISTS (SELECT 1 FROM bot_images WHERE bot_id = $1 AND asset = 'channel_avatar')
          OR NOT EXISTS (SELECT 1 FROM bot_images WHERE bot_id = $1 AND asset = 'channel_banner')
        )`,
    [botId, second],
  );
  const saved = await pool.query<BotRow>(`${SELECT_BOTS} WHERE b.id = $1 GROUP BY b.id`, [botId]);
  res.json({ bot: toDto(saved.rows[0]) });
});

// Upload limit errors (too big, too many files) become friendly 400s.
botsRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const messages: Partial<Record<string, string>> = {
      LIMIT_FILE_SIZE: `Each image must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller.`,
      LIMIT_FILE_COUNT: `You can add up to ${MAX_IMAGES} images.`,
      LIMIT_UNEXPECTED_FILE: `You can add up to ${MAX_IMAGES} images.`,
    };
    res.status(400).json({ error: messages[err.code] ?? 'Upload failed.' });
    return;
  }
  next(err);
});
