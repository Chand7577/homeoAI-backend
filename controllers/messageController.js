const Message = require('../models/Message');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const isRoomParticipant = (roomId, userId) =>
  typeof roomId === 'string' && roomId.split('_').includes(String(userId));

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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set([
      'application/pdf', 'image/jpeg', 'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    if (!allowed.has(file.mimetype)) return cb(new Error('Unsupported attachment type'));
    cb(null, true);
  }
});

const getMessagesByRoom = async (req, res) => {
  const { roomId } = req.params;
  if (!isRoomParticipant(roomId, req.user._id)) {
    res.status(403);
    throw new Error('You are not a participant in this conversation');
  }
  const messages = await Message.find({ roomId }).sort({ createdAt: 1 });
  res.json({ success: true, data: messages });
};

const createMessage = async (req, res) => {
  const { text, roomId, time, attachmentUrl, attachmentName, attachmentType } = req.body;
  const senderId = String(req.user._id);
  if (!isRoomParticipant(roomId, senderId)) {
    res.status(403);
    throw new Error('You are not a participant in this conversation');
  }
  const receiverId = roomId.split('_').find(id => id !== senderId);
  if (!receiverId) {
    res.status(400);
    throw new Error('Invalid conversation room');
  }
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
  const senderId = String(req.user._id);
  
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

// Share prescription to patient's chat inbox
const sharePrescription = async (req, res) => {
  try {
    const { prescriptionId, patientId, doctorId, prescriptionData } = req.body;
    
    if (!patientId || !doctorId) {
      res.status(400);
      throw new Error('Patient ID and Doctor ID are required');
    }
    
    // Generate roomId (consistent format: smaller_larger)
    const roomId = [doctorId, patientId].sort().join('_');
    
    // Format prescription message
    const medicines = prescriptionData.medicines?.map((m, idx) => 
      `${idx + 1}. ${m.name} ${m.potency} - ${m.quantity} ${m.form} ${m.frequency} ${m.meal}`
    ).join('\n') || prescriptionData.remedy || '';
    
    const messageText = `📋 Dr. ${prescriptionData.doctorName || 'Nautiyal'} sent you a prescription\n\n` +
      `👤 Patient: ${prescriptionData.patientName}\n` +
      `📅 Date: ${new Date(prescriptionData.prescribedAt || prescriptionData.createdAt).toLocaleDateString()}\n\n` +
      `💊 Medicines:\n${medicines}\n\n` +
      `⏱️ Duration: ${prescriptionData.duration || '—'}`;
    
    // Create message in database
    const message = await Message.create({
      senderId: doctorId,
      receiverId: patientId,
      text: messageText,
      roomId,
      attachmentType: 'prescription',
      attachmentUrl: prescriptionId || null,
      attachmentName: `Prescription - ${prescriptionData.patientName}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    
    // TODO: Emit socket event to notify patient in real-time
    // if (req.app.get('io')) {
    //   req.app.get('io').to(roomId).emit('new-message', message);
    // }
    
    res.status(201).json({ 
      success: true, 
      data: message,
      message: 'Prescription shared successfully'
    });
  } catch (error) {
    console.error('Error sharing prescription:', error);
    res.status(res.statusCode === 200 ? 500 : res.statusCode).json({
      success: false,
      message: error.message || 'Failed to share prescription'
    });
  }
};

module.exports = {
  getMessagesByRoom,
  createMessage,
  uploadAttachment,
  uploadAttachmentFile,
  deleteMessage,
  sharePrescription
};
