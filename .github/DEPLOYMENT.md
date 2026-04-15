# Deployment Guide

Automated deployment via GitHub Actions. Two environments:

- **Staging** -- push to `deploy-staging` triggers `.github/workflows/deploy-staging.yml`
- **Production** -- push to `deploy-prod` triggers `.github/workflows/deploy-prod.yml`

Both workflows run on GitHub-hosted runners, build Docker images, push them to GitHub Container Registry (GHCR), then SSH into the target server and run `docker compose up -d`.

## Architecture

```
GitHub Actions (ubuntu-latest)
  ├── Build & push API image         → ghcr.io/<owner>/pt-server:<sha>
  ├── Build & push OpenWearables img → ghcr.io/<owner>/pt-openwearables:<sha>
  └── SSH to deploy host
        ├── scp docker-compose.yml, .env, openwearables.env → /opt/pt-server
        ├── docker login ghcr.io
        ├── docker compose pull
        ├── docker compose up -d --remove-orphans
        └── docker compose exec api yarn migrate:latest
```

Services in the deployed stack:
- `api` -- NestJS API (port 5100)
- `openwearables` -- Python backend (port 8000)
- `openwearables-worker` -- Celery worker
- `openwearables-beat` -- Celery beat scheduler
- `redis` -- Redis 8 for Celery

The database is external (RDS or self-hosted elsewhere), configured via `DB_HOST`.

## Server Prerequisites

1. **Install Docker + Compose plugin:**
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   ```

2. **Create deploy user:**
   ```bash
   sudo useradd -m -s /bin/bash deploy
   sudo usermod -aG docker deploy
   ```

3. **Create deploy directory:**
   ```bash
   sudo mkdir -p /opt/pt-server
   sudo chown deploy:deploy /opt/pt-server
   ```

4. **Generate SSH keypair** (on your local machine):
   ```bash
   ssh-keygen -t ed25519 -C "gh-actions-deploy" -f ./gh_deploy_key
   ssh-copy-id -i ./gh_deploy_key.pub deploy@<server>
   # Then add the contents of gh_deploy_key (private) to GitHub secrets as DEPLOY_SSH_KEY_STAGING / DEPLOY_SSH_KEY_PROD
   ```

## GitHub Secrets

Per environment (suffix `_STAGING` or `_PROD`):

| Secret | Description |
|---|---|
| `DEPLOY_SSH_KEY_*` | Private SSH key for connecting to the deploy host |
| `DB_HOST_*` / `DB_PORT_*` / `DB_USER_*` / `DB_PASSWORD_*` / `DB_NAME_*` | App database credentials |
| `JWT_ACCESS_TOKEN_SECRET_*` / `JWT_REFRESH_TOKEN_SECRET_*` | JWT secrets |
| `SWAGGER_USERNAME_*` / `SWAGGER_PASSWORD_*` | Swagger basic auth |
| `AWS_ACCESS_KEY_*` / `AWS_SECRET_KEY_*` | AWS credentials (S3, MediaConvert, CloudFront) |
| `CLOUDFRONT_KEY_PAIR_ID_*` / `CLOUDFRONT_PRIVATE_KEY_*` | CloudFront signed-URL keypair |
| `FIREBASE_CLIENT_EMAIL_*` / `FIREBASE_PRIVATE_KEY_*` | Firebase Admin credentials |
| `MEDIA_CONVERT_ROLE_*` / `MEDIA_CONVERT_QUEUE_*` | MediaConvert role + queue ARNs |
| `STRAVA_CLIENT_ID_*` / `STRAVA_CLIENT_SECRET_*` / `STRAVA_WEBHOOK_VERIFY_TOKEN_*` | Strava OAuth/webhook |
| `GARMIN_CONSUMER_KEY_*` / `GARMIN_CONSUMER_SECRET_*` | Garmin OAuth |
| `OPENAI_API_KEY_*` | OpenAI API key |
| `OPENWEARABLES_API_KEY_*` | API key used by the NestJS app to call OpenWearables |
| `OW_DB_HOST_*` / `OW_DB_PORT_*` / `OW_DB_NAME_*` / `OW_DB_USER_*` / `OW_DB_PASSWORD_*` | OpenWearables database credentials |
| `OPENWEARABLES_ENV_*` | Full contents of the OpenWearables `.env` file (see `openwearables/backend/config/.env.example`) |

## GitHub Variables

Per environment (suffix `_STAGING` or `_PROD`):

| Variable | Description |
|---|---|
| `DEPLOY_HOST_*` | Server hostname or IP |
| `DEPLOY_SSH_USER_*` | SSH username (e.g. `deploy`) |
| `API_V1_URL_*` | Public API URL |
| `DB_SSL_*` | `Y` or `N` |
| `JWT_ACCESS_TOKEN_EXPIRY_*` / `JWT_REFRESH_TOKEN_EXPIRY_*` | Token TTLs |
| `S3_REGION_*` / `S3_UPLOAD_BUCKET_*` / `S3_CONTENT_BUCKET_*` | S3 config |
| `CDN_URL_*` / `DISABLE_CDN_*` | CDN config |
| `MEDIA_CONVERT_REGION_*` / `DISABLE_MEDIA_CONVERT_*` | MediaConvert config |
| `FIREBASE_PROJECT_ID_*` | Firebase project ID |
| `STRAVA_REDIRECT_URI_*` / `GARMIN_REDIRECT_URI_*` | OAuth redirect URIs |
| `OPENAI_MODEL_*` | OpenAI model (e.g. `gpt-4-turbo`) |

## Manual Operations

Connect to the deploy host and run inside `/opt/pt-server`:

```bash
# Status
docker compose ps

# Logs
docker compose logs -f api
docker compose logs -f openwearables-worker

# Restart a service
docker compose restart api

# Run a one-off command
docker compose exec api yarn migrate:latest
docker compose exec api yarn repl

# Health check
curl http://localhost:5100/v1/health
```

## Rollback

Each deploy tags images with the git SHA. To roll back, edit `/opt/pt-server/.env` on the server and change `API_IMAGE` / `OPENWEARABLES_IMAGE` to the previous SHA's tag, then `docker compose up -d`.
