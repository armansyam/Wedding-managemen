#!/usr/bin/env bash
set -euo pipefail

APP_NAME="wedding-management"
BRANCH="${1:-main}"

echo "Deploy target: ${BRANCH}"

if [ ! -d ".git" ]; then
  echo "Error: .git not found. Run this inside repo root."
  exit 1
fi

# Ensure database directory exists
echo "Ensuring database directory exists..."
mkdir -p db/data

# Ensure .env file exists
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "Please edit the .env file with your configurations."
fi

git fetch --all --tags

if git rev-parse --verify "${BRANCH}" >/dev/null 2>&1; then
  git checkout "${BRANCH}"
  git pull origin "${BRANCH}" || true
  VERSION="$(git rev-parse --short HEAD)"
  echo "Checked out branch: ${BRANCH}"
else
  if git rev-parse --verify "refs/tags/${BRANCH}" >/dev/null 2>&1; then
    git checkout -f "tags/${BRANCH}"
    VERSION="${BRANCH}"
    echo "Checked out tag: ${BRANCH}"
  else
    echo "Error: target '${BRANCH}' not found as branch or tag."
    exit 1
  fi
fi

echo "Running version: ${VERSION}"

if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --production
fi

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
    echo "Restarting application using PM2 ecosystem..."
    pm2 restart ecosystem.config.js --update-env
  else
    echo "Starting application using PM2 ecosystem..."
    pm2 start ecosystem.config.js
  fi
  pm2 save
else
  echo "Warning: pm2 not found. Start app manually with: node server.js"
fi

echo "Deploy done."
