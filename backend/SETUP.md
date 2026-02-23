# Backend Setup Guide

## Quick Start

1. **Install Dependencies:**sd
   ```bash
   npm install
   ```

2. **Configure Environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start MongoDB:**
   ```bash
   # Make sure MongoDB is running
   mongod
   ```

4. **Start Redis (Optional but Recommended):**
   ```bash
   redis-server
   ```

5. **Run the Server:**
   ```bash
   npm run dev  # Development mode with auto-reload
   # or
   npm start    # Production mode
   ```

## SMSHub Configuration

The SMSHub integration is implemented in `modules/auth/services/smsService.js`. 

**Important:** You need to adjust the API endpoint and request format based on your SMSHub provider's actual API documentation.

### Common SMSHub API Patterns:

1. **Body-based POST request:**
   ```javascript
   POST /api/send
   {
     "apiKey": "your-key",
     "phone": "+919876543210",
     "message": "Your OTP is 123456",
     "senderId": "APPZETO"
   }
   ```

2. **Query-based GET request:**
   ```javascript
   GET /api/send?api_key=your-key&to=+919876543210&message=Your%20OTP%20is%20123456&sender=APPZETO
   ```

3. **Header-based authentication:**
   ```javascript
   POST /api/send
   Headers: { "Authorization": "Bearer your-api-key" }
   Body: { "to": "+919876543210", "message": "Your OTP is 123456" }
   ```

### To Configure:

1. Update `SMSHUB_API_URL` in `.env` with your provider's endpoint
2. Update the request format in `modules/auth/services/smsService.js` based on your provider's documentation
3. Test the OTP sending functionality

### Testing OTP:

```bash
# Send OTP
curl -X POST http://localhost:5000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "purpose": "login"}'

# Verify OTP
curl -X POST http://localhost:5000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "otp": "123456", "purpose": "login"}'
```

## Database Setup

### MongoDB Collections:

The following collections will be created automatically:
- `users` - User accounts
- `otps` - OTP records (auto-expire after 5 minutes)

### Indexes:

- `users.phone` - Unique index
- `users.email` - Unique sparse index
- `otps.phone` - Index for faster lookups

## Authentication Flow

1. **Send OTP:** User requests OTP via `/api/auth/send-otp`
2. **Verify OTP:** User verifies OTP via `/api/auth/verify-otp`
3. **Get Tokens:** System returns access token (24 hours) and sets refresh token in httpOnly cookie (7 days)
4. **Use Access Token:** Include in Authorization header: `Bearer <access-token>`
5. **Refresh Token:** Use `/api/auth/refresh-token` to get new access token

## Troubleshooting

### MongoDB Connection Issues:

#### Local MongoDB:
- Ensure MongoDB is running: `mongod`
- Check `MONGODB_URI` in `.env`
- Verify MongoDB is accessible on the specified host/port

#### MongoDB Atlas (Cloud):
If you're using MongoDB Atlas and getting connection errors:

1. **IP Whitelist Issue (Most Common):**
   - Error: "Could not connect to any servers in your MongoDB Atlas cluster. One common reason is that you're trying to access the database from an IP that isn't whitelisted."
   - Solution:
     - Go to your MongoDB Atlas dashboard: https://cloud.mongodb.com/
     - Navigate to: **Network Access** → **IP Access List**
     - Click **Add IP Address**
     - Either:
       - Add your current IP address (temporary solution)
       - Or add `0.0.0.0/0` to allow all IPs (⚠️ **Only for development/testing - not recommended for production**)
     - Click **Confirm**
   - Wait 1-2 minutes for changes to propagate
   - Try connecting again

2. **Connection String:**
   - Verify `MONGODB_URI` in `.env` matches your Atlas connection string
   - Format should be: `mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority`
   - Make sure username and password are URL-encoded if they contain special characters

3. **Database User:**
   - Ensure you've created a database user in Atlas with appropriate permissions
   - Go to: **Database Access** → **Add New Database User**
   - Choose password authentication and set appropriate privileges

### Redis Connection Issues:
- Redis is optional - app will work without it
- OTP rate limiting will be less effective without Redis
- Check `REDIS_HOST` and `REDIS_PORT` in `.env`

### SMSHub OTP Not Sending:
- Verify `SMSHUB_API_KEY` is correct
- Check `SMSHUB_API_URL` matches your provider
- Review SMSHub API documentation for correct request format
- Check server logs for error messages
- Ensure phone number format is correct (with country code)

### JWT Token Issues:
- Verify `JWT_SECRET` is set in `.env`
- Ensure token is included in Authorization header: `Bearer <token>`
- Check token expiry times in `.env`

## Next Steps

1. Implement other modules (user, restaurant, order, etc.)
2. Set up file upload handling
3. Configure email service
4. Set up payment gateway (Razorpay)
5. Implement real-time features with Socket.IO
6. Set up background jobs with Bull and Redis

