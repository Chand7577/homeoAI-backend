const express = require('express');
const router = express.Router();
const { authenticate, requireClinicalUser } = require('../middleware/auth');
const { getMessagesByRoom, createMessage, uploadAttachment, uploadAttachmentFile, deleteMessage, sharePrescription } = require('../controllers/messageController');

router.use(authenticate);
router.get('/:roomId', getMessagesByRoom);
router.post('/', createMessage);
router.post('/upload', uploadAttachment.single('file'), uploadAttachmentFile);
router.post('/share-prescription', requireClinicalUser, sharePrescription);
router.delete('/:id', deleteMessage);

module.exports = router;
