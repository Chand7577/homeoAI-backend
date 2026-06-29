const express = require('express');
const router = express.Router();
const { getMessagesByRoom, createMessage, uploadAttachment, uploadAttachmentFile, deleteMessage } = require('../controllers/messageController');

router.get('/:roomId', getMessagesByRoom);
router.post('/', createMessage);
router.post('/upload', uploadAttachment.single('file'), uploadAttachmentFile);
router.delete('/:id', deleteMessage);

module.exports = router;
