require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);

app.get('/', (req, res) => {
  res.send('Kampüs Sorun Bildirim API çalışıyor.');
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB bağlantısı başarılı.');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));
  })
  .catch((err) => {
    console.error('MongoDB bağlantı hatası:', err.message);
  });
