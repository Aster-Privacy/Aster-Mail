#!/bin/bash

source $HOME/.cargo/env 2>/dev/null || true

cd "$(dirname "$0")"

echo "========================================"
echo "   AsterMail Development Environment (Linux AMD64)"
echo "========================================"
echo ""

echo "[1/4] Stopping old processes..."
pkill -x MailHog 2>/dev/null
pkill -x MailHog_linux_amd64 2>/dev/null
pkill -x astermail_backend 2>/dev/null
pgrep -f "npm.*run.*dev" | xargs kill 2>/dev/null
pgrep -f "vite.*5173" | xargs kill 2>/dev/null
sleep 2

echo "[2/4] Starting Backend..."
BACKEND_DIR="../Aster-Backend"

if [ ! -d "$BACKEND_DIR" ]; then
    echo "     ERROR: Backend directory not found at $BACKEND_DIR"
    echo "     Please ensure Aster-Backend repo is cloned next to Aster-Mail"
    exit 1
fi

cd "$BACKEND_DIR"

if [ -f ".env" ]; then
    while IFS='=' read -r key value; do
        [[ -z "$key" || "$key" =~ ^# ]] && continue
        value="${value%\"}"
        value="${value#\"}"
        export "$key=$value"
    done < .env
fi

if [ -z "$CSRF_SECRET" ]; then
    echo "     CSRF_SECRET not set, generating random value for development..."
    export CSRF_SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n')
fi

echo "     Running database migrations..."
if ! command -v sqlx &>/dev/null; then
    echo "     sqlx not found, installing w cargo..."
    cargo install sqlx-cli --no-default-features --features postgres
fi

if command -v sqlx &>/dev/null; then
    sqlx migrate run
    if [ $? -ne 0 ]; then
        echo "     WARNING: Migrations failed. Database may not be ready."
    else
        echo "     Migrations complete!"
    fi
else
    echo "     WARNING: sqlx-cli installation failed, skipping migrations."
fi

echo "     Building backend..."
cargo build --release
if [ $? -ne 0 ]; then
    echo "     ERROR: Backend build failed!"
    cd ..
    exit 1
fi
echo "     Backend build complete!"

./target/release/astermail_backend &
cd ../Aster-Mail

echo "     Waiting for backend to start..."
sleep 3

echo "[3/4] Starting Frontend..."
echo "     Installing dependencies..."
npm install
echo "     Dependencies installed!"
npm run dev -- --host &

sleep 2

echo ""
echo "========================================"
echo "   All services started!"
echo "========================================"
echo ""
echo "   Stalwart:  http://localhost:8080 (admin UI)"
echo "   Backend:   http://localhost:3000"
echo "   Frontend:  http://localhost:5173"
echo ""
echo "   Press Ctrl+C to stop all services"
echo "========================================"

wait
