// Fonts for text we draw ourselves (captions, banner titles). Montserrat is
// under the SIL Open Font License (assets/fonts/OFL.txt).
import { join } from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';

export const FONT = 'Montserrat';
GlobalFonts.registerFromPath(join(import.meta.dirname, '..', 'assets', 'fonts', 'Montserrat.ttf'), FONT);
