// Writes a scannable QR for the Expo tunnel URL (run: node scripts/make-qr.js)
const QRCode = require('qrcode');
const path = require('path');

const url = process.argv[2] || 'exp://zghgqbw-anonymous-8081.exp.direct';
const out = path.resolve(__dirname, '..', '..', 'expense-tracker-qr.png');

QRCode.toFile(out, url, { width: 480, margin: 2 }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`QR WRITTEN: ${out} -> ${url}`);
});
