import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://quickspicyofficial_db_user:nfIgadyMRjHXZxeN@cluster0.qilrmoh.mongodb.net/quickspicy';

async function checkZones() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected!');

  const db = mongoose.connection.db;

  // Let's find Poojitha Family Restaurant
  const restaurantsCol = db.collection('restaurants');
  const restaurant = await restaurantsCol.findOne({ name: /Poojitha/i });
  console.log('\n--- Restaurant ---');
  if (restaurant) {
    console.log('Name:', restaurant.name);
    console.log('Location:', JSON.stringify(restaurant.locationObject || restaurant.location));
    console.log('Zone ID:', restaurant.zoneId);
  } else {
    console.log('Poojitha Family Restaurant not found!');
  }

  // Let's find zones
  const zonesCol = db.collection('zones');
  const zones = await zonesCol.find({}).toArray();
  console.log('\n--- Zones ---');
  console.log(`Total Zones: ${zones.length}`);
  zones.forEach(zone => {
    console.log(`- Zone: ${zone.name} (${zone.zoneName})`);
    console.log(`  ID: ${zone._id}`);
    console.log(`  Active: ${zone.isActive}`);
    console.log(`  Coordinates sample:`, JSON.stringify(zone.coordinates));
  });

  // Let's find users and their addresses
  const usersCol = db.collection('users');
  const users = await usersCol.find({}).toArray();
  console.log('\n--- Users and Addresses ---');
  console.log(`Total Users: ${users.length}`);
  users.forEach(user => {
    console.log(`User: ${user.name} (${user.email})`);
    if (user.addresses && user.addresses.length > 0) {
      console.log(`  Addresses (${user.addresses.length}):`);
      user.addresses.forEach(addr => {
        console.log(`    - [${addr.label}] ${addr.street}, ${addr.city}, ${addr.state}`);
        console.log(`      Location coordinates:`, JSON.stringify(addr.location || { lat: addr.latitude, lng: addr.longitude }));
      });
    } else {
      console.log(`  No saved addresses.`);
    }
  });

  await mongoose.disconnect();
  console.log('\nDisconnected!');
}

checkZones().catch(err => {
  console.error(err);
  process.exit(1);
});
