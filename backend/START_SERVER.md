# Backend Server Start Guide

## Quick Fix for Network Error

The network error happens because the backend server is not running. Follow these steps:

### Step 1: Check MongoDB is Running

**Windows:**
```powershell
# Check if MongoDB service is running
Get-Service -Name MongoDB -ErrorAction SilentlyContinue

# If not running, start it:
Start-Service -Name MongoDB
```

**Or check manually:**
- Open Services (services.msc)
- Look for "MongoDB" service
- Start it if it's stopped

### Step 2: Check Environment Variables

Create `.env` file in `appzetofood/backend/` directory with:

```env
MONGODB_URI=mongodb://localhost:27017/appzetofood
JWT_SECRET=your-secret-key-here-change-this-in-production
PORT=5000
NODE_ENV=development
```

### Step 3: Start Backend Server

Open PowerShell/Command Prompt in `appzetofood/backend/` directory:

```powershell
npm start
```

**Expected Output:**
```
✅ MongoDB Connected: localhost
Server running in development mode on port 5000
```

### Step 4: Verify Server is Running

Open browser and go to:
```
http://localhost:5000/health
```

Or test in PowerShell:
```powershell
Invoke-WebRequest -Uri http://localhost:5000/health
```

### Step 5: Refresh Frontend

Once backend is running:
1. Refresh your frontend browser
2. Network errors should disappear
3. Offers and wallet data should load

## Troubleshooting

### Error: "MongoDB connection failed"
- Make sure MongoDB is installed and running
- Check MONGODB_URI in .env file
- Try: `mongod` in a separate terminal

### Error: "Port 5000 already in use"
```powershell
# Find process using port 5000
netstat -ano | findstr :5000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Error: "Cannot find module"
```powershell
# Reinstall dependencies
npm install
```

## Quick Start Script

Save this as `start-backend.ps1` in backend directory:

```powershell
# Check MongoDB
$mongoService = Get-Service -Name MongoDB -ErrorAction SilentlyContinue
if (-not $mongoService -or $mongoService.Status -ne 'Running') {
    Write-Host "⚠️ MongoDB service not running. Please start it first."
    exit 1
}

# Check .env file
if (-not (Test-Path .env)) {
    Write-Host "⚠️ .env file not found. Creating template..."
    @"
MONGODB_URI=mongodb://localhost:27017/appzetofood
JWT_SECRET=dev-secret-key-change-in-production
PORT=5000
NODE_ENV=development
"@ | Out-File -FilePath .env -Encoding utf8
    Write-Host "✅ Created .env file. Please update with your values."
}

# Start server
Write-Host "🚀 Starting backend server..."
npm start
```

Run it:
```powershell
.\start-backend.ps1
```

