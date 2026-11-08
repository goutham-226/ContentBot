-- Voice samples are now static files in client/public/voices, recorded once,
-- so listening never calls Replicate.
DROP TABLE voice_previews;
