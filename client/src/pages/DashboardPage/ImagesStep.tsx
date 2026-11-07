import { useState } from 'react';
import type { DragEvent } from 'react';
import { ImageIcon, XIcon } from '../../components/icons';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGES, MAX_IMAGE_MB } from './images';
import type { DraftImage } from './images';

type ImagesStepProps = {
  images: DraftImage[];
  error: string;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
};

export default function ImagesStep({ images, error, onAdd, onRemove }: ImagesStepProps) {
  const [dragging, setDragging] = useState(false);
  const full = images.length >= MAX_IMAGES;

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (!full) onAdd([...e.dataTransfer.files]);
  }

  return (
    <div className="images-step">
      <div
        className={`dropzone ${dragging ? 'is-dragging' : ''} ${full ? 'is-full' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <ImageIcon />
        {full ? (
          <p>You’ve added the maximum of {MAX_IMAGES} images.</p>
        ) : (
          <>
            <p>
              <input
                id="identity-images"
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                multiple
                className="sr-only"
                onChange={(e) => {
                  onAdd([...(e.target.files ?? [])]);
                  e.target.value = ''; // let the same file be picked again after removing it
                }}
              />
              <label htmlFor="identity-images" className="dropzone-browse">Browse</label> or drag images here
            </p>
            <p className="dropzone-hint">
              PNG, JPG, WEBP or GIF · up to {MAX_IMAGE_MB} MB each · max {MAX_IMAGES}
            </p>
          </>
        )}
      </div>

      {error && <p className="images-error" role="alert">{error}</p>}

      {images.length > 0 && (
        <ul className="thumbs" aria-label="Added images">
          {images.map((img) => (
            <li key={img.id} className="thumb">
              <img src={img.url} alt={img.file.name} />
              <button
                type="button"
                className="thumb-remove"
                onClick={() => onRemove(img.id)}
                aria-label={`Remove ${img.file.name}`}
                title="Remove"
              >
                <XIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
