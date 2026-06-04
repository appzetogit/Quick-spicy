import fs from 'fs';

const content = fs.readFileSync('z:/projects/quick/frontend/src/module/user/pages/restaurants/RestaurantDetails.jsx', 'utf8');
const lines = content.split('\n');

console.log('Searching for AlertCircle:');
lines.forEach((line, index) => {
  if (line.includes('AlertCircle')) {
    console.log(`${index + 1}: ${line}`);
  }
});

console.log('\nSearching for isOutOfService:');
lines.forEach((line, index) => {
  if (line.includes('isOutOfService')) {
    console.log(`${index + 1}: ${line}`);
  }
});
