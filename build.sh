#!/bin/bash
# Render build script - installs system packages needed for PDF scanning
echo "📦 Installing system dependencies for PDF scanning..."

# Install poppler-utils (provides pdftoppm for image-based PDF scanning)
if command -v apt-get &> /dev/null; then
    apt-get install -y poppler-utils || true
fi

echo "✅ System dependencies installed."

# Install Node.js dependencies
npm install
echo "✅ Node.js dependencies installed."
