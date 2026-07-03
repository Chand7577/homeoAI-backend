const Message = require('../models/Message');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure disk storage for chat attachments (PDFs, Docs, Images, etc.)
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
  }
});

const uploadAttachment = multer({
  storage: diskStorage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB file size limit
});

const getMessagesByRoom = async (req, res) => {
  const { roomId } = req.params;
  const messages = await Message.find({ roomId }).sort({ createdAt: 1 });
  res.json({ success: true, data: messages });
};

const createMessage = async (req, res) => {
  const { senderId, receiverId, text, roomId, time, attachmentUrl, attachmentName, attachmentType } = req.body;
  const message = await Message.create({
    senderId,
    receiverId,
    text,
    roomId,
    time,
    attachmentUrl,
    attachmentName,
    attachmentType
  });
  res.status(201).json({ success: true, data: message });
};

const uploadAttachmentFile = async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }

  const relativeUrl = `/uploads/${req.file.filename}`;
  res.json({
    success: true,
    data: {
      fileUrl: relativeUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype
    }
  });
};

const deleteMessage = async (req, res) => {
  const { id } = req.params;
  const { senderId } = req.body; // Who is trying to delete
  
  const message = await Message.findById(id);
  
  if (!message) {
    res.status(404);
    throw new Error('Message not found');
  }
  
  // Check if the person deleting is the sender
  if (message.senderId !== senderId) {
    res.status(403);
    throw new Error('You can only delete your own messages');
  }
  
  // Delete attachment file if exists
  if (message.attachmentUrl) {
    const filename = path.basename(message.attachmentUrl);
    const filePath = path.join(__dirname, '../uploads', filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Error removing attachment file:', err);
      }
    }
  }
  
  await Message.findByIdAndDelete(id);
  res.json({ success: true, message: 'Message deleted successfully' });
};

module.exports = {
  getMessagesByRoom,
  createMessage,
  uploadAttachment,
  uploadAttachmentFile,
  deleteMessage
};
