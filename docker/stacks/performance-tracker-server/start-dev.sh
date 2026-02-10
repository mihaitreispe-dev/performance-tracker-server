#!/bin/bash
echo "please run this from project root folder e.g. ./docker/stacks/performance-tracker-server/start-dev.sh"

set -a
source .env
set +a

docker stack deploy \
    --resolve-image=always \
    --prune \
    -c docker/stacks/performance-tracker-server/docker-compose.dev.yml \
    performance-tracker-server
