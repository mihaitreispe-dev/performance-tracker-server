# Deployment Guide

This document describes how to set up GitHub Actions for automated deployment.

## Prerequisites

1. A server with Docker and Docker Compose installed
2. SSH access to the server
3. GitHub Container Registry access

## GitHub Secrets (Repository Settings → Secrets and variables → Actions → Secrets)

These are sensitive values that should never be exposed:

| Secret | Description |
|--------|-------------|
| `SSH_HOST` | Server hostname or IP address |
| `SSH_USERNAME` | SSH username for deployment |
| `SSH_PRIVATE_KEY` | SSH private key for authentication |
| `SSH_PORT` | (Optional) SSH port, defaults to 22 |
| `JWT_ACCESS_TOKEN_SECRET` | Secret for signing JWT access tokens |
| `JWT_REFRESH_TOKEN_SECRET` | Secret for signing JWT refresh tokens |
| `DB_USER` | Database username |
| `DB_PASSWORD` | Database password |
| `AWS_ACCESS_KEY` | AWS access key ID |
| `AWS_SECRET_KEY` | AWS secret access key |
| `CLOUDFRONT_KEY_PAIR_ID` | CloudFront key pair ID (if using signed URLs) |
| `CLOUDFRONT_PRIVATE_KEY` | CloudFront private key (if using signed URLs) |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key |
| `STRAVA_CLIENT_ID` | Strava OAuth client ID |
| `STRAVA_CLIENT_SECRET` | Strava OAuth client secret |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Token for Strava webhook verification |
| `GARMIN_CONSUMER_KEY` | Garmin OAuth consumer key |
| `GARMIN_CONSUMER_SECRET` | Garmin OAuth consumer secret |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key |

## GitHub Variables (Repository Settings → Secrets and variables → Actions → Variables)

These are non-sensitive configuration values:

| Variable | Description | Example |
|----------|-------------|---------|
| `DEPLOY_PATH` | Path on server where the app is deployed | `/home/user/performance-tracker-server` |
| `APP_URL` | Public URL of the application | `https://api.example.com` |
| `API_V1_URL` | Full API URL | `https://api.example.com` |
| `JWT_ACCESS_TOKEN_EXPIRY` | Access token expiry duration | `15m` |
| `JWT_REFRESH_TOKEN_EXPIRY` | Refresh token expiry duration | `7d` |
| `DB_HOST` | Database host | `db` (for docker) or hostname |
| `DB_PORT` | Database port | `5432` |
| `DB_NAME` | Database name | `performance_tracker` |
| `DB_SSL` | Use SSL for database | `Y` or `N` |
| `S3_ENDPOINT` | S3 endpoint (for S3-compatible storage) | Leave empty for AWS |
| `S3_REGION` | S3 region | `us-east-1` |
| `S3_UPLOAD_BUCKET` | S3 bucket for uploads | `uploads` |
| `S3_CONTENT_BUCKET` | S3 bucket for content | `content` |
| `CDN_URL` | CDN URL for assets | `https://cdn.example.com` |
| `DISABLE_CDN` | Disable CDN | `N` |
| `MEDIA_CONVERT_REGION` | AWS MediaConvert region | `us-east-1` |
| `MEDIA_CONVERT_ROLE` | MediaConvert IAM role ARN | |
| `MEDIA_CONVERT_QUEUE` | MediaConvert queue ARN | |
| `DISABLE_MEDIA_CONVERT` | Disable MediaConvert | `N` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | `my-project` |
| `STRAVA_REDIRECT_URI` | Strava OAuth callback URL | `https://api.example.com/v1/integrations/strava/callback` |
| `GARMIN_REDIRECT_URI` | Garmin OAuth callback URL | `https://api.example.com/v1/integrations/garmin/callback` |

## Server Setup

1. **Install Docker and Docker Compose:**
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   ```

2. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/performance-tracker-server.git
   cd performance-tracker-server
   ```

3. **Create deployment user (optional but recommended):**
   ```bash
   sudo useradd -m -s /bin/bash deploy
   sudo usermod -aG docker deploy
   ```

4. **Set up SSH keys:**
   ```bash
   # On your local machine
   ssh-keygen -t ed25519 -C "deploy@performance-tracker"

   # Copy public key to server
   ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@your-server

   # Add private key to GitHub Secrets as SSH_PRIVATE_KEY
   ```

## Manual Deployment

If you need to deploy manually:

```bash
# Pull latest code
git pull origin main

# Create .env file with your values
cp .env.example .env
# Edit .env with your values

# Run migrations
docker-compose --profile migrate up migrate

# Deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Workflows

### CI (`ci.yml`)
- Runs on: Push to `main`/`dev`, Pull requests
- Steps: Lint, Type check, Test, Build

### Deploy (`deploy.yml`)
- Runs on: Push to `main`, Manual trigger
- Steps: Build Docker image, Push to GHCR, Deploy via SSH, Run migrations

### Release (`release.yml`)
- Runs on: Tag push (`v*`)
- Steps: Build versioned Docker image, Create GitHub Release

## Monitoring

After deployment, verify the service is running:

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f api

# Check health endpoint
curl http://localhost:5100/health
```
