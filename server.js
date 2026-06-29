require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const { initAI } = require('./config/aiConfig');

const PORT = process.env.PORT || 5000;

// Create HTTP server instead of listening directly on Express app
const server = http.createServer(app);

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const Message = require('./models/Message');

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // When a user joins a room (e.g., patient-doctor specific room)
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`User with ID: ${socket.id} joined room: ${roomId}`);
  });

  // Join doctor notification room for symptom submissions
  socket.on('join_doctor_notifications', (doctorId) => {
    socket.join(`doctor_${doctorId}`);
    console.log(`Doctor ${doctorId} joined notification room`);
  });

  // When a message is sent
  socket.on('send_message', async (data) => {
    try {
      const parts = data.roomId.split('_');
      const receiverId = parts.find(p => p !== data.senderId) || '';
      
      await Message.create({
        senderId: data.senderId,
        receiverId: receiverId,
        text: data.text || '',
        roomId: data.roomId,
        time: data.time,
        attachmentUrl: data.attachmentUrl || null,
        attachmentName: data.attachmentName || null,
        attachmentType: data.attachmentType || null
      });
    } catch (err) {
      console.error('Failed to save message to DB:', err);
    }

    // Broadcast to everyone in the room except the sender
    socket.to(data.roomId).emit('receive_message', data);
  });

  // When a patient submits new symptoms
  socket.on('submit_patient_symptoms', async (data) => {
    try {
      console.log('📝 New patient symptom submission:', data);
      
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
    console.log(`User disconnected: ${socket.id}`);
  });
});

const start = async () => {
  await connectDB();
  initAI();
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📋 API docs: http://localhost:${PORT}/api/health`);
  });
};

start();
