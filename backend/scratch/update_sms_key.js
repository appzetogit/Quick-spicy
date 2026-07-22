import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function updateSmsCreds() {
  const newApiKey = 'JRN2PydPJEeqS8YxUIu7eQ';
  const newSenderId = 'MSGSMS';

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const col = mongoose.connection.db.collection('environmentvariables');
    
    const doc = await col.findOne({});
    if (!doc) {
      console.log('❌ No environmentvariables document found!');
      await mongoose.disconnect();
      return;
    }

    console.log('\n=== CURRENT VALUES ===');
    console.log('SMSINDIAHUB_API_KEY:', doc.SMSINDIAHUB_API_KEY || '(empty)');
    console.log('SMSINDIAHUB_SENDER_ID:', doc.SMSINDIAHUB_SENDER_ID || '(empty)');

    // Update both API key and Sender ID
    const result = await col.updateOne(
      { _id: doc._id },
      { 
        $set: { 
          SMSINDIAHUB_API_KEY: newApiKey,
          SMSINDIAHUB_SENDER_ID: newSenderId,
          lastUpdatedAt: new Date()
        } 
      }
    );

    console.log('\n=== UPDATE RESULT ===');
    console.log('Matched:', result.matchedCount, '| Modified:', result.modifiedCount);

    const updated = await col.findOne({ _id: doc._id });
    console.log('\n=== UPDATED VALUES ===');
    console.log('SMSINDIAHUB_API_KEY:', updated.SMSINDIAHUB_API_KEY);
    console.log('SMSINDIAHUB_SENDER_ID:', updated.SMSINDIAHUB_SENDER_ID);

    await mongoose.disconnect();
    console.log('\n✅ Done');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

updateSmsCreds();
