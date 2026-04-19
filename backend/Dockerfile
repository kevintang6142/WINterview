FROM python:3.12-slim

# uv for fast installs — Railway's base images don't ship it.
RUN pip install --no-cache-dir uv

WORKDIR /app

# Copy only the manifest first so dep install is cached across code-only changes.
COPY pyproject.toml ./
RUN uv pip install --system --no-cache -r pyproject.toml

COPY . .

# Railway injects $PORT. Bind 0.0.0.0 so it's reachable inside the container.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
