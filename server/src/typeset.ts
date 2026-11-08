// Puts the channel name on a banner. Image models misspell lettering, so the
// banner is drawn without text and the name is set here in a real font.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { FONT } from './fonts.ts';

export async function addBannerTitle(image: Buffer, title: string): Promise<Buffer> {
  const picture = await loadImage(image);
  const { width, height } = picture;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(picture, 0, 0);

  // YouTube crops banners hard on phones: keep the name inside the centre ~60%.
  let size = Math.round(height * 0.16);
  const font = () => `900 ${size}px ${FONT}`;
  ctx.font = font();
  while (ctx.measureText(title).width > width * 0.6 && size > 12) {
    size -= 2;
    ctx.font = font();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = size * 0.25;
  ctx.shadowOffsetY = size * 0.06;
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = '#111';
  ctx.strokeText(title, width / 2, height / 2);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#fff';
  ctx.fillText(title, width / 2, height / 2);
  return canvas.encode('jpeg', 92);
}
