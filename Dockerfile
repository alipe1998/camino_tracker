# 1) Use the uv image with Python preinstalled:
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# 2) Copy your entire project into /app
WORKDIR /app
COPY . /app

# 3) Sync (this creates the virtualenv and installs everything)
#    it will look at pyproject.toml and uv.lock
RUN uv sync --locked

# 4) Put the venv on the PATH
ENV PATH="/app/.venv/bin:$PATH"

# 5) Expose (if you’re using Uvicorn on 8000)
EXPOSE 8000

# 6) Launch your app via uv:
#    adjust the command to whatever your entry point is
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80"]
