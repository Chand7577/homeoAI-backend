# 📦 External PDF Storage Guide

## Problem
Boericke's Pocket Manual (49.79 MB) is too large for:
- ❌ Cloudinary free tier (10 MB limit)
- ❌ Render free tier local storage (ephemeral, deleted on restart)

## ✅ Solution: Use Google Drive (Free!)

Upload your large PDF to Google Drive once, then link it to your app permanently.

---

## 🚀 Step-by-Step Guide

### 1. Upload PDF to Google Drive

1. Go to https://drive.google.com
2. Click **+ New** → **File upload**
3. Upload `Boericke_Pocket_Manual.pdf` (49.79 MB)
4. Wait for upload to complete

### 2. Make PDF Publicly Accessible

1. Right-click the uploaded PDF → **Share**
2. Change access to: **Anyone with the link** → **Viewer**
3. Click **Copy link**
4. You'll get a link like:
   ```
   https://drive.google.com/file/d/1ABC123XYZ456/view?usp=sharing
   ```

### 3. Set the External URL in Your App

**Option A: Using Frontend UI (when implemented)**
- Go to Reference Library
- Select "Boericke's Pocket Manual"
- Click "Set External PDF URL"
- Paste the Google Drive link
- Click Save

**Option B: Using API Directly (current method)**

```bash
curl -X PUT https://homeoai-backend-83yt.onrender.com/api/repertories/REPERTORY_ID/external-pdf-url \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://drive.google.com/file/d/1ABC123XYZ456/view?usp=sharing",
    "fileName": "Boericke_Pocket_Manual.pdf"
  }'
```

---

## 🔗 Supported Storage Providers

### Google Drive (Recommended)
- ✅ 15 GB free storage
- ✅ Auto-converts sharing links to direct download
- ✅ Fast, reliable CDN

### Dropbox
- ✅ 2 GB free storage
- ✅ Auto-converts to direct download (dl=1 parameter)
- ✅ Good alternative

### Any Direct Link
- ✅ Any publicly accessible PDF URL works
- Example: `https://example.com/files/manual.pdf`

---

## 🎯 Benefits

✅ **Permanent storage** - No more re-uploading after server restarts  
✅ **Free unlimited** - Google Drive offers 15 GB free  
✅ **Fast loading** - Served from Google's global CDN  
✅ **Easy updates** - Just replace the file in Google Drive  

---

## 🛠️ Technical Details

The backend automatically:
- Converts Google Drive sharing links to direct download URLs
- Converts Dropbox links to direct download (dl=1)
- Stores the URL in MongoDB (permanent)
- Redirects PDF requests to the external URL

**No file storage on Render = No ephemeral disk issues!**

---

## 📝 API Endpoint

**PUT** `/api/repertories/:id/external-pdf-url`

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: application/json`

**Body:**
```json
{
  "url": "https://drive.google.com/file/d/FILE_ID/view?usp=sharing",
  "fileName": "Boericke_Pocket_Manual.pdf"
}
```

**Response:**
```json
{
  "success": true,
  "message": "External PDF URL set successfully",
  "data": {
    "pdfUrl": "https://drive.google.com/uc?export=download&id=FILE_ID",
    "pdfName": "Boericke_Pocket_Manual.pdf"
  }
}
```

---

## ⚠️ Important Notes

1. **PDF must be public** - "Anyone with the link" can view
2. **Don't delete from Drive** - The link will break if you delete the file
3. **One-time setup** - Upload once, works forever
4. **No API keys needed** - Simple public URL approach

---

## 🎬 Quick Demo

```bash
# 1. Get your auth token (after login)
TOKEN="your_jwt_token_here"

# 2. Find Boericke repertory ID
curl https://homeoai-backend-83yt.onrender.com/api/repertories \
  -H "Authorization: Bearer $TOKEN" \
  | grep -A 5 "Boericke"

# 3. Set external PDF URL
curl -X PUT https://homeoai-backend-83yt.onrender.com/api/repertories/REPERTORY_ID_HERE/external-pdf-url \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://drive.google.com/file/d/YOUR_FILE_ID/view?usp=sharing",
    "fileName": "Boericke_Pocket_Manual.pdf"
  }'
```

---

## 🎉 Result

After setup, your Reference Library will:
- ✅ Load PDF from Google Drive
- ✅ Work on mobile and desktop
- ✅ Survive server restarts
- ✅ Load fast (Google's CDN)

**No more re-uploading PDFs!** 🚀
