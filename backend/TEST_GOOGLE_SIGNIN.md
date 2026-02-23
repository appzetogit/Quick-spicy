# Google Sign-In End-to-End Test Guide

यह guide आपको Google sign-in के complete flow को test करने में help करेगा।

## Test Script: `test-google-signin.js`

यह script निम्नलिखित tests करता है:
1. ✅ MongoDB database connection
2. ✅ User existence check (before sign-in)
3. ✅ Backend API call with Firebase ID token
4. ✅ User storage in database verification
5. ✅ All required fields check (name, email, googleId, signupMethod, etc.)
6. ✅ Existing user login flow

## How to Run the Test

### Step 1: Backend Server Start करें

```bash
cd appzetofood/backend
npm run dev
```

Backend server `http://localhost:5000` पर run होना चाहिए।

### Step 2: Frontend Server Start करें

```bash
cd appzetofood/frontend
npm run dev
```

Frontend server `http://localhost:5173` पर run होना चाहिए।

### Step 3: Test Script Run करें

```bash
cd appzetofood/backend
node test-google-signin.js
```

### Step 4: Firebase ID Token Get करें

Test script run करने के बाद, यह आपसे Firebase ID token मांगेगा। Token get करने के लिए:

1. Browser में जाएं: `http://localhost:5173/auth/sign-in`
2. Google sign-in button click करें
3. Google account select करें (panchalajay717@gmail.com)
4. Browser console खोलें (F12)
5. Console में ये command run करें:

```javascript
// Firebase auth instance get करें
import { firebaseAuth } from './lib/firebase.js';

// या browser console में:
// (SignIn.jsx में already logs हैं, check करें)

// Direct token get करने के लिए:
firebaseAuth.currentUser?.getIdToken().then(token => {
  console.log('ID Token:', token);
  // यह token copy करें
});
```

**या** browser console में देखें:
- "✅ Firebase ID token obtained" log में token हो सकता है
- Network tab में backend API call check करें, request payload में token होगा

### Step 5: Token Paste करें

Test script में token paste करें और Enter press करें।

## Expected Results

### ✅ Success Case:

```
✅ Database Connection: Passed
✅ User Exists Check: Passed
✅ Backend API Call: Passed
✅ User in Database: Passed (All fields present)
✅ Existing User Login: Passed
```

### Database में User के Fields:

- ✅ `name`: User का name
- ✅ `email`: User का email (lowercase)
- ✅ `role`: "user"
- ✅ `googleId`: Firebase UID
- ✅ `googleEmail`: Google email
- ✅ `signupMethod`: "google"
- ✅ `profileImage`: Google profile image URL (if available)
- ✅ `isActive`: true
- ✅ `createdAt`: Creation timestamp
- ✅ `updatedAt`: Update timestamp

## Troubleshooting

### Error: "MongoDB connection failed"

- Check `.env` file में `MONGODB_URI` set है या नहीं
- MongoDB server running है या नहीं check करें
- MongoDB Atlas use कर रहे हैं तो IP whitelist check करें

### Error: "Backend API request failed"

- Backend server running है या नहीं check करें (`http://localhost:5000`)
- `.env` में `BACKEND_URL` correct है या नहीं

### Error: "User not found in database"

- User successfully sign-in हुआ है या नहीं check करें
- Database में manually check करें:
  ```javascript
  // MongoDB shell में:
  db.users.findOne({ email: "panchalajay717@gmail.com", role: "user" })
  ```

### Error: "Missing required fields"

- Database में user exists है लेकिन कुछ fields missing हैं
- Backend logs check करें
- User model schema check करें

## Manual Database Check

MongoDB में directly check करने के लिए:

```javascript
// MongoDB shell या MongoDB Compass में:
use appzetofood; // या आपका database name

// User find करें
db.users.findOne({ 
  email: "panchalajay717@gmail.com", 
  role: "user" 
});

// सभी Google sign-in users देखें
db.users.find({ signupMethod: "google" });

// Specific user के सभी fields देखें
db.users.findOne({ 
  email: "panchalajay717@gmail.com" 
}, { 
  name: 1, 
  email: 1, 
  googleId: 1, 
  googleEmail: 1, 
  signupMethod: 1, 
  role: 1, 
  isActive: 1, 
  createdAt: 1 
});
```

## Test Without ID Token

अगर आप ID token के बिना सिर्फ database check करना चाहते हैं:

1. Test script run करें
2. ID token prompt पर Enter press करें (skip करें)
3. Script automatically database में existing user check करेगा

## Next Steps

Test successful होने के बाद:

1. ✅ User database में properly store हो रहा है
2. ✅ All required fields present हैं
3. ✅ Backend API properly काम कर रहा है
4. ✅ Existing user login flow काम कर रहा है

अगर कोई issue है, तो:
- Backend logs check करें
- Frontend console logs check करें
- Database में directly verify करें

