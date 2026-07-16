// Alternative server for Heroku deployment
// This file serves as a fallback if vite preview doesn't work
// The Procfile uses npm start which runs vite preview by default

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Serve static files from dist directory
app.use(express.static(join(__dirname, 'dist')));

// Serve index.html for all routes (SPA routing)
app.get('*', (req, res) => {
  try {
    const html = readFileSync(join(__dirname, 'dist', 'index.html'), 'utf-8');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error loading application');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});



