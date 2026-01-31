#!/bin/bash

# EC2 Setup Script for AI Document Search
# Run this on your EC2 instance (Ubuntu/Debian)

# 1. Update system
echo "Updating system..."
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Node.js (v20)
echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install MySQL Server
echo "Installing MySQL..."
sudo apt-get install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql

# 4. Install PM2 (Process Manager)
echo "Installing PM2..."
sudo npm install -g pm2

# 5. Install Nginx
echo "Installing Nginx..."
sudo apt-get install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 6. Secure MySQL (Automated)
# Note: You should run 'sudo mysql_secure_installation' manually for better security
# This sets a default root password 'root' for simplicity - CHANGE THIS!
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root';"

echo "========================================"
echo "Setup Complete!"
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "MySQL status: $(sudo systemctl is-active mysql)"
echo "Nginx status: $(sudo systemctl is-active nginx)"
echo "========================================"
