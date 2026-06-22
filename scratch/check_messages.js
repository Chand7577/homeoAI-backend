require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Message = require('../models/Message');

const check = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/homo');
  
  const count = await Message.countDocuments();
  if (count === 0) {
    console.log('Seeding chat messages...');
    const dummyMessages = [
      // dr-jp & pat-amrit
      { senderId: 'dr-jp', receiverId: 'pat-amrit', roomId: 'dr-jp_pat-amrit', text: 'Hello Amrit. How is your headache today?', time: '09:30 AM' },
      { senderId: 'pat-amrit', receiverId: 'dr-jp', roomId: 'dr-jp_pat-amrit', text: 'It is much better now, doctor. But feeling slightly drowsy.', time: '09:35 AM' },
      { senderId: 'dr-jp', receiverId: 'pat-amrit', roomId: 'dr-jp_pat-amrit', text: 'That is expected with the first few doses of Nux Vomica. Reduce the dose to 2 drops once a day in the evening.', time: '09:38 AM' },
      // dr-rahul & pat-amrit
      { senderId: 'dr-rahul', receiverId: 'pat-amrit', roomId: 'dr-rahul_pat-amrit', text: 'Hello, please send your previous prescription.', time: 'Yesterday' },
      { senderId: 'pat-amrit', receiverId: 'dr-rahul', roomId: 'dr-rahul_pat-amrit', text: 'Sure, sending in a minute.', time: 'Yesterday' },
      // dr-priya & pat-amrit
      { senderId: 'dr-priya', receiverId: 'pat-amrit', roomId: 'dr-priya_pat-amrit', text: 'Please report symptoms after 3 days of Belladonna.', time: '3 days ago' },
      // dr-jp & pat-rahul
      { senderId: 'pat-rahul', receiverId: 'dr-jp', roomId: 'dr-jp_pat-rahul', text: 'Acidity is better now, thank you.', time: '10:15 AM' },
      { senderId: 'dr-jp', receiverId: 'pat-rahul', roomId: 'dr-jp_pat-rahul', text: 'Excellent! Continue Carbo Veg for another 2 days and then stop.', time: '10:20 AM' },
      // dr-jp & pat-priya
      { senderId: 'pat-priya', receiverId: 'dr-jp', roomId: 'dr-jp_pat-priya', text: 'Cough increased at night. High fever since evening.', time: 'Yesterday' },
      { senderId: 'dr-jp', receiverId: 'pat-priya', roomId: 'dr-jp_pat-priya', text: 'Give Aconite 30, 4 globules every 2 hours. Keep me updated.', time: 'Yesterday' },
      // dr-jp & pat-arav
      { senderId: 'pat-arav', receiverId: 'dr-jp', roomId: 'dr-jp_pat-arav', text: 'Sent reports of blood test.', time: '2 days ago' }
    ];
    await Message.insertMany(dummyMessages);
    console.log('Seeding complete.');
  } else {
    console.log('Messages already seeded.');
  }

  const finalCount = await Message.countDocuments();
  console.log(`FINAL MESSAGE COUNT: ${finalCount}`);
  process.exit(0);
};

check();
