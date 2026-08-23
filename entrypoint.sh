#!/usr/bin/env bash
set -euo pipefail

if [ -n "${VERCEL_TOKEN:-}" ]; then
  echo "Logging in to Vercel CLI..."
  vercel login --token "$VERCEL_TOKEN" || echo "Vercel login skipped/failed, continuing."
fi

if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "Logging in to Supabase CLI..."
  supabase login --token "$SUPABASE_ACCESS_TOKEN" || echo "Supabase login skipped/failed, continuing."
fi

exec node bot.js
