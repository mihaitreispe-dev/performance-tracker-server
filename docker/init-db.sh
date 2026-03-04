#!/bin/bash
set -e

# Create the OpenWearables database if it doesn't exist
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE openwearables'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'openwearables')\gexec
    GRANT ALL PRIVILEGES ON DATABASE openwearables TO $POSTGRES_USER;
EOSQL

echo "Database initialization complete."
