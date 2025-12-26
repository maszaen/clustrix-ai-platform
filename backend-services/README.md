# Clustrix Backend Services

Backend untuk Clustrix Mobile App - Proxy AI API dengan rate limiting dan user management.

## Features
- 🔐 Secure API key storage (environment variables)
- 👤 Per-user rate limiting (by Google account)
- 📊 Request logging
- ⚙️ Admin panel untuk manage models
- 🚀 Deploy ke GCP Cloud Run

## Stack
- Node.js + Express
- Firebase Admin (verify Google tokens)
- Redis (rate limiting) - optional, bisa pakai in-memory
- SQLite/Firestore (logs & user data)

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill API keys
3. `npm run dev` for local development
4. `npm run deploy` for GCP Cloud Run

## API Endpoints
- `POST /api/chat` - Proxy chat request
- `GET /api/models` - Get available models
- `GET /api/user/usage` - Get user's usage stats
- `POST /admin/models` - Update available models (admin only)

## Environment Variables
See `.env.example`
