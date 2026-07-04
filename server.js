require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const { initAI } = require('./config/aiConfig');

const PORT = process.env.PORT || 5000;

// Create HTTP server instead of listening directly on Express app
const server = http.createServer(app);

// Setup Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://homeoai13.netlify.app',
      process.env.FRONTEND_URL
    ].filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

const Message = require('./models/Message');
const User = require('./models/User');

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  // User connected (removed console.log for production)

  // When a user joins a room (e.g., patient-doctor specific room)
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
  });

  // Join doctor notification room for symptom submissions
  socket.on('join_doctor_notifications', (doctorId) => {
    socket.join(`doctor_${doctorId}`);
  });

  // When a message is sent - OPTIMIZED: Non-blocking DB write
  socket.on('send_message', async (data, callback) => {
    try {
      // Immediately acknowledge to sender (optimistic UI)
      const tempId = `temp_${Date.now()}`;

      // Look up sender's name for dynamic contact addition on receiver side
      let senderName = data.senderName || '';
      if (!senderName && data.senderId) {
        try {
          const senderUser = await User.findById(data.senderId).select('name');
          if (senderUser) senderName = senderUser.name;
        } catch (_) {
          // Non-critical: if lookup fails, senderName stays empty
        }
      }

      const responseData = {
        ...data,
        senderName,
        _id: tempId
      };
      
      // Broadcast to room immediately (don't wait for DB)
      socket.to(data.roomId).emit('receive_message', responseData);
      
      // Acknowledge back to sender immediately
      if (typeof callback === 'function') {
        callback({ success: true, _id: tempId });
      }

      // Save to DB asynchronously (non-blocking)
      const parts = data.roomId.split('_');
      const receiverId = parts.find(p => p !== data.senderId) || '';
      
      Message.create({
        senderId: data.senderId,
        receiverId: receiverId,
        text: data.text || '',
        roomId: data.roomId,
        time: data.time,
        attachmentUrl: data.attachmentUrl || null,
        attachmentName: data.attachmentName || null,
        attachmentType: data.attachmentType || null
      }).then(created => {
        // Emit real DB ID to both sender and receiver for sync
        io.to(data.roomId).emit('message_synced', {
          tempId: tempId,
          realId: created._id.toString()
        });
      }).catch(err => {
        console.error('Failed to save message to DB:', err);
        // Emit error to sender
        socket.emit('message_save_failed', { tempId, error: err.message });
      });
      
    } catch (err) {
      console.error('Failed to handle message:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  // When a message is deleted
  socket.on('delete_message', async (data) => {
    try {
      const message = await Message.findById(data.messageId);
      if (message) {
        if (message.attachmentUrl) {
          const filename = path.basename(message.attachmentUrl);
          const filePath = path.join(__dirname, 'uploads', filename);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (err) {
              console.error('Error removing attachment file via socket:', err);
            }
          }
        }
        await Message.findByIdAndDelete(data.messageId);
      }
      // Broadcast deletion notification to the other users in the room
      socket.to(data.roomId).emit('message_deleted', { messageId: data.messageId });
    } catch (err) {
      console.error('Failed to delete message from DB:', err);
    }
  });

  // Typing indicator events
  socket.on('typing', (data) => {
    // Broadcast typing status to others in the room (not to sender)
    socket.to(data.roomId).emit('user_typing', {
      userId: data.userId,
      userName: data.userName,
      isTyping: true
    });
  });

  socket.on('stop_typing', (data) => {
    // Broadcast stop typing status to others in the room
    socket.to(data.roomId).emit('user_typing', {
      userId: data.userId,
      userName: data.userName,
      isTyping: false
    });
  });

  // When a patient submits new symptoms
  socket.on('submit_patient_symptoms', async (data) => {
    try {
      // Removed console.log for production
      
      // Broadcast to all doctors (in real applications, you'd target specific doctors)
      io.emit('new_symptom_submission', {
        id: data.id,
        patientId: data.patientId,
        patientName: data.patientName,
        age: data.age,
        submittedAt: data.submittedAt,
        symptoms: data.symptoms,
        fullSymptomText: data.fullSymptomText,
        language: data.language,
        status: 'Pending',
        assignedDoctorId: data.assignedDoctorId,
        assignedDoctorName: data.assignedDoctorName
      });

      // Also send to specific assigned doctor if available
      if (data.assignedDoctorId) {
        io.to(`doctor_${data.assignedDoctorId}`).emit('urgent_patient_symptom', data);
      }

    } catch (err) {
      console.error('Failed to handle symptom submission:', err);
    }
  });

  socket.on('disconnect', () => {
    // User disconnected (removed console.log for production)
  });
});

const start = async () => {
  await connectDB();
  initAI();
  server.listen(PORT, () => {
    // Server started (console.log removed for production)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📋 API docs: http://localhost:${PORT}/api/health`);
    }
  });
};

start();
