# How to Get a Working Gemini API Key

## Problem
Your current API key uses the **old v1beta API** where Gemini models are deprecated/removed.

## Solution
Generate a **NEW API key** from Google AI Studio (not Google Cloud Console):

### Step 1: Go to Google AI Studio
https://aistudio.google.com/app/apikey

### Step 2: Create New API Key
1. Click **"Create API Key"**
2. Select your Google Cloud project (or create a new one)
3. Click **"Create API key in existing project"**
4. **Copy the API key** (starts with `AIza...`)

### Step 3: Verify It Works
The new key should work with model name: `gemini-1.5-flash`

Test it here: https://aistudio.google.com/

### Step 4: Add to Render.com
1. Go to https://dashboard.render.com/
2. Select your service: `homeoai-backend-83yt`
3. Go to **Environment** tab
4. Find `GEMINI_API_KEY`
5. **Paste your NEW API key**
6. Click **Save Changes**
7. Click **Manual Deploy** → **Deploy latest commit**

## Important Notes

### ❌ Old API (v1beta) - DOESN'T WORK
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/`
- Models: `gemini-pro`, `gemini-1.0-pro` (deprecated)
- Your current key uses this

### ✅ New API (v1) - WORKS
- Endpoint: `https://generativelanguage.googleapis.com/v1/`
- Models: `gemini-1.5-flash`, `gemini-1.5-pro`
- New keys from AI Studio use this

## Alternative: Use OpenAI Instead

If Gemini keeps failing, you can switch to OpenAI:

1. Get OpenAI API key: https://platform.openai.com/api-keys
2. Install package: `npm install openai`
3. Update aiConfig.js to use OpenAI GPT-4

Let me know if you want to switch to OpenAI!

## Troubleshooting

After updating the API key, check server logs for:
- ✅ `Gemini gemini-1.5-flash configured` → Success!
- ❌ `404 Not Found models/gemini-1.5-flash` → API key still old

If you still get 404 errors, the API key is wrong. Delete it and create a fresh one.
