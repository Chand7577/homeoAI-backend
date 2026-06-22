const express = require('express');
const router = express.Router();
const { getMessagesByRoom, createMessage } = require('../controllers/messageController');

router.get('/:roomId', getMessagesByRoom);
router.post('/', createMessage);

module.exports = router;
