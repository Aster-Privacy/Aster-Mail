#!/bin/bash

cd "$(dirname "$0")"

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    ARCH_LABEL="Apple Silicon"
    MAILHOG_BIN="MailHog_darwin_arm64"
else
    ARCH_LABEL="Intel"
    MAILHOG_BIN="MailHog_darwin_amd64"
fi

echo "========================================"
echo "   AsterMail Development Environment (macOS $ARCH_LABEL)"
echo "========================================"
echo ""

echo "[1/4] Stopping old processes..."
pkill -f MailHog 2>/dev/null
pkill -f astermail_backend 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 2

echo "[2/4] Starting MailHog..."
if [ -f "./mailhog/$MAILHOG_BIN" ]; then
    ./mailhog/$MAILHOG_BIN &
elif [ -f "./mailhog/MailHog_darwin_amd64" ]; then
    ./mailhog/MailHog_darwin_amd64 &
elif command -v mailhog &>/dev/null; then
    mailhog &
elif command -v MailHog &>/dev/null; then
    MailHog &
else
    echo "     WARNING: MailHog not found, skipping..."
    echo "     Install with: brew install mailhog"
fi

echo "[3/4] Starting Backend..."
BACKEND_DIR="../Aster-Backend"

if [ ! -d "$BACKEND_DIR" ]; then
    echo "     ERROR: Backend directory not found at $BACKEND_DIR"
    echo "     Please ensure Aster-Backend repo is cloned next to Aster-Mail"
    exit 1
fi

cd "$BACKEND_DIR"

if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

echo "     Running database migrations..."
if command -v sqlx &>/dev/null; then
    sqlx migrate run
    if [ $? -ne 0 ]; then
        echo "     WARNING: Migrations failed. Database may not be ready."
    else
        echo "     Migrations complete!"
    fi
else
    cargo sqlx migrate run 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "     WARNING: sqlx-cli not found or migrations failed."
        echo "     Install with: cargo install sqlx-cli"
    else
        echo "     Migrations complete!"
    fi
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

echo "[4/4] Starting Frontend..."
npm run dev &

sleep 2

echo ""
echo "========================================"
echo "   All services started!"
echo "========================================"
echo ""
echo "   MailHog:  http://localhost:8025"
echo "   Backend:  http://localhost:3000"
echo "   Frontend: http://localhost:5173"
echo ""
echo "   Press Ctrl+C to stop all services"
echo "========================================"

wait
