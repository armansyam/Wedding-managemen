#!/usr/bin/env bash
set -euo pipefail

APP_NAME="wedding-management"
BRANCH="${1:-main}"

echo "Deploy target: ${BRANCH}"

if [ ! -d ".git" ]; then
  echo "Error: .git not found. Run this inside repo root."
  exit 1
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
    pm2 restart "${APP_NAME}" --update-env
  else
    pm2 start server.js --name "${APP_NAME}"
  fi
  pm2 save
else
  echo "Warning: pm2 not found. Start app manually with: node server.js"
fi

echo "Deploy done."