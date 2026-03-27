FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV DASHBOARD_CACHE_PATH=/tmp/dashboard.json

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md /app/
COPY src /app/src
COPY apps/api /app/apps/api
COPY data /app/data

RUN python -m pip install --upgrade pip setuptools wheel && \
    python -m pip install .

EXPOSE 8000

CMD ["sh", "-c", "python -m uvicorn apps.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

