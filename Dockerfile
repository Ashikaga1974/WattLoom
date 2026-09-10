# Frontend-Build in eigener Stage, damit das Runtime-Image kein Node braucht
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY --from=frontend-build /app/frontend/dist frontend/dist

# DATA_BASE_DIR (siehe backend/paths.py) zeigt damit auf das Volume statt ins Image
ENV WATTLOOM_DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Ein einziger Worker: SQLite verträgt keine parallelen Schreibprozesse
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
