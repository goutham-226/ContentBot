# Postgres with the pgvector extension, on the same Alpine base as before so
# the existing data volume (and its text indexes) stays compatible.
FROM postgres:17-alpine

ARG PGVECTOR_VERSION=v0.8.0
RUN apk add --no-cache --virtual .build-deps git build-base \
 && git clone --depth 1 --branch "$PGVECTOR_VERSION" https://github.com/pgvector/pgvector.git /tmp/pgvector \
 && make -C /tmp/pgvector OPTFLAGS="" with_llvm=no \
 && make -C /tmp/pgvector with_llvm=no install \
 && rm -rf /tmp/pgvector \
 && apk del .build-deps
