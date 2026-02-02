#!/bin/bash
echo "please run this from project root folder e.g. ./docker/stacks/performance-tracker-server/stop-dev.sh"

docker stack rm performance-tracker-server
