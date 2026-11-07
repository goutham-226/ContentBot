export const MAX_IMAGES = 10;
export const MAX_IMAGE_MB = 10;
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export type DraftImage = {
  id: string;
  file: File;
  url: string; // object URL for the preview
};
