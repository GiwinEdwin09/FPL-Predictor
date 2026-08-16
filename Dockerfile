FROM python:3.12-slim

ARG MODEL_VERSION=v2

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=10000
ENV DASHBOARD_CACHE_PATH=/tmp/dashboard.json
ENV MODEL_VERSION=${MODEL_VERSION}

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt pyproject.toml README.md /app/
COPY src /app/src
COPY apps/api /app/apps/api
COPY data /app/data

RUN python -m pip install --upgrade pip setuptools wheel && \
    python -m pip install -r requirements.txt && \
    python -m pip install --no-deps . && \
    if [ "${MODEL_VERSION}" = "v3" ]; then \
        python -m fpl_predictor.runtime_assets --model-version v3 --reuse-existing-bundle --dashboard-path /tmp/dashboard.json; \
    else \
        python -m fpl_predictor.runtime_assets --model-version v2 --dashboard-path /tmp/dashboard.json; \
    fi

EXPOSE 8000

CMD ["sh", "-c", "python -m uvicorn apps.api.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
