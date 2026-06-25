#!/bin/bash

# Quick start script untuk Sorehari backend

echo "🚀 Sorehari Backend Setup"
echo "========================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js tidak ditemukan. Silakan install Node.js dulu:"
    echo ""
    echo "MacOS:"
    echo "  brew install node"
    echo ""
    echo "Atau download dari: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js ditemukan: $(node --version)"
echo "✅ npm ditemukan: $(npm --version)"
echo ""

cd "$(dirname "$0")"

echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Installation berhasil!"
    echo ""
    echo "🎯 Langkah selanjutnya:"
    echo "  npm start          - Jalankan server"
    echo "  npm run dev        - Jalankan dengan watch mode"
    echo ""
    echo "📱 Admin Dashboard:"
    echo "  http://localhost:3000/admin.html"
else
    echo "❌ Installation gagal"
    exit 1
fi
