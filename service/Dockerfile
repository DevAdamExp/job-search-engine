# job-search-engine: the upstream portal CLIs (Bun) behind a small FastAPI service.
# Build context = repository root:  docker build -f service/Dockerfile .
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 BUN_INSTALL=/usr/local
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates \
 && curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2" \
 && apt-get purge -y unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /engine
COPY service/requirements.txt service/requirements.txt
RUN pip install --no-cache-dir -r service/requirements.txt
COPY tools tools
COPY .agents .agents
COPY service service
RUN useradd -r -u 10001 engine && chown -R engine:engine /engine
USER engine
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=4).status==200 else 1)"
CMD ["uvicorn", "service.app:app", "--host", "0.0.0.0", "--port", "8090"]
