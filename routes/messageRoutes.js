const express = require('express');
const router = express.Router();
const { getMessagesByRoom, createMessage, uploadAttachment, uploadAttachmentFile, deleteMessage, sharePrescription } = require('../controllers/messageController');

router.get('/:roomId', getMessagesByRoom);
router.post('/', createMessage);
router.post('/upload', uploadAttachment.single('file'), uploadAttachmentFile);
router.post('/share-prescription', sharePrescription);
router.delete('/:id', deleteMessage);

module.exports = router;
