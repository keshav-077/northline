FROM node:22-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend backend
COPY app.py .
COPY pyproject.toml .
COPY data data
COPY --from=frontend /src/dist /srv/frontend/dist
ENV STATIC_DIR=/srv/frontend/dist
ENV SNAPSHOT_PATH=/srv/data/snapshot
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
