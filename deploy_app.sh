#!/bin/bash

# Deployment Script
# Run this from the project root on EC2

echo "Starting deployment..."

# 1. Update Code (assuming git pull, but for local transfer use scp)
# git pull origin main 

# 2. Setup Backend
echo "Setting up Backend..."
cd backend
npm install
# Ensure .env exists (you might need to copy it manually or use a secrets manager)
if [ ! -f .env ]; then
    echo "⚠️  WARNING: .env file missing in backend! Please create it."
fi

# 3. Setup Frontend
echo "Setting up Frontend..."
cd ../frontend
npm install
npm run build

# 4. Setup Database
echo "Initializing Database..."
cd ..
# Only run this if you want to reset the DB
# mysql -u root -p < schema.sql

# 5. Restart Services
echo "Restarting application with PM2..."
cd backend
pm2 restart document-search-api || pm2 start server.js --name "document-search-api"

echo "========================================"
echo "Deployment Complete!"
echo "Backend running on port 5001"
echo "Frontend built to frontend/build/"
echo "========================================"
