# Deploying to AWS EC2

This guide walks you through deploying the AI Document Search application to an AWS EC2 instance.

## Prerequisites

- AWS Account
- Access to launch an EC2 instance
- SSH Key Pair (pem file) for access

## Step 1: Launch EC2 Instance

1. Go to AWS Console > **EC2**.
2. Click **Launch Instances**.
3. Choose **Ubuntu Server 22.04 LTS** (or 20.04).
4. Instance Type: **t2.micro** (Free Tier eligible) or larger (t3.small recommended for better compilation performance).
5. Key Pair: Select existing or create new.
6. **Security Group Rules** (Add these):
   - SSH (Port 22) - from your IP
   - HTTP (Port 80) - from Anywhere
   - Custom TCP (Port 5001) - from Anywhere (optional, if testing directly)
7. Launch the instance.

## Step 2: Connect to Instance

Open your terminal and run:

```bash
chmod 400 your-key.pem
ssh -i "your-key.pem" ubuntu@your-ec2-public-ip
```

## Step 3: Server Setup

Copy the `setup_ec2.sh` script to your server content or create it there:

```bash
nano setup_ec2.sh
# Paste the content of setup_ec2.sh here
ctrl+x to save and exit

chmod +x setup_ec2.sh
./setup_ec2.sh
```

This will install Node.js 20, MySQL, PM2, and Nginx.

## Step 4: Transfer Project Files

From your **local machine**, use SCP to transfer the project files (excluding node_modules):

```bash
# Compress the project first (locally)
tar -czvf search-engine.tar.gz "search engine" --exclude="node_modules" --exclude=".git"

# Transfer to EC2
scp -i "your-key.pem" search-engine.tar.gz ubuntu@your-ec2-public-ip:~/

# On EC2 via SSH
tar -xzvf search-engine.tar.gz
cd "search engine"
```

## Step 5: Configure Application

1. **Configure Backend Environment:**
   Create `.env` file in `backend/`:
   ```bash
   cd backend
   nano .env
   ```
   Paste your `.env` content (include your API Key!).

2. **Run Deployment Script:**
   ```bash
   cd ..
   chmod +x deploy_app.sh
   ./deploy_app.sh
   ```

   This will:
   - Install backend dependencies
   - Install frontend dependencies
   - Build the React frontend
   - Start the backend server with PM2

## Step 6: Configure Nginx (Reserve Proxy)

To serve the app on Port 80 (standard HTTP):

1. Create Nginx config:
   ```bash
   sudo nano /etc/nginx/sites-available/default
   ```

2. Replace content with:
   ```nginx
   server {
       listen 80;
       server_name _;  # Or your domain name

       # Frontend (Static Files)
       location / {
           root /home/ubuntu/search engine/frontend/build;
           index index.html;
           try_files $uri $uri/ /index.html;
       }

       # Backend API Proxy
       location /api {
           proxy_pass http://localhost:5001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. Restart Nginx:
   ```bash
   sudo nginx -t
   sudo systemctl restart nginx
   ```

## Step 7: Access Your App

Visit `http://your-ec2-public-ip` in your browser. You should see the AI Document Search application!

## Optional: Database Setup (if using local MySQL)

If you chose to use the local MySQL on EC2:

1. Log in to MySQL:
   ```bash
   sudo mysql -u root -p
   # Enter password (default 'root' if you set it in setup script)
   ```

2. Create database and tables:
   ```sql
   CREATE DATABASE document_search;
   USE document_search;
   -- Paste content from schema.sql
   ```
   
   Or run:
   ```bash
   mysql -u root -p < schema.sql
   ```
