const Message = require('../models/Message');

const getMessagesByRoom = async (req, res) => {
  const { roomId } = req.params;
  const messages = await Message.find({ roomId }).sort({ createdAt: 1 });
  res.json({ success: true, data: messages });
};

const createMessage = async (req, res) => {
  const { senderId, receiverId, text, roomId, time } = req.body;
  const message = await Message.create({ senderId, receiverId, text, roomId, time });
  res.status(201).json({ success: true, data: message });
};

module.exports = { getMessagesByRoom, createMessage };
