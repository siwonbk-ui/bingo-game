const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GAMESTATES_FILE = path.join(DATA_DIR, 'gamestates.json');

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Increased limit for images
app.use(express.static(path.join(__dirname, 'public')));
// Serve uploaded images
const UPLOAD_DIR = path.join(__dirname, 'Upload Image');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}
app.use('/uploads', express.static(UPLOAD_DIR));

// Helper to read JSON
function readJSON(file, defaultValue = []) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2));
        return defaultValue;
    }
    try {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error(`Error reading ${file}:`, e);
        return defaultValue;
    }
}

// Helper to write JSON
function writeJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        console.error(`Error writing ${file}:`, e);
        return false;
    }
}

// --- Routes ---

// Cloudinary Config
const cloudinary = require('cloudinary').v2;
cloudinary.config({
    cloud_name: 'dgd730vsp',
    api_key: '927568914494151',
    api_secret: 'f_wifbGqFQguGwxXJPQaYHbi5Y8'
});

// Upload Image Endpoint
app.post('/api/upload', async (req, res) => {
    const { userId, image } = req.body;

    if (!userId || !image) {
        return res.status(400).json({ success: false, message: 'Missing userId or image' });
    }

    try {
        // Upload to Cloudinary directly from Base64 string
        const result = await cloudinary.uploader.upload(image, {
            folder: `bingo_uploads/${userId}`,
            resource_type: 'image'
        });

        // Return the secure URL
        res.json({ success: true, url: result.secure_url });

    } catch (e) {
        console.error("Cloudinary upload failed", e);
        res.status(500).json({ success: false, message: 'Cloudinary upload failed: ' + (e.message || e) });
    }
});

// Delete Image Endpoint
app.delete('/api/upload', async (req, res) => {
    const { userId, url } = req.body;

    if (!userId || !url) {
        return res.status(400).json({ success: false, message: 'Missing userId or url' });
    }

    try {
        // Extract filename from URL (Cloudinary URL structure vary, but we kept it simple)
        // URL: .../bingo_uploads/USERID/FILENAME.jpg
        const parts = url.split('/');
        const fileName = parts.pop();

        // Cloudinary Public ID logic
        const publicIdWithExt = `bingo_uploads/${userId}/${fileName}`;
        const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.')) || publicIdWithExt;

        console.log(`Deleting from Cloudinary: ${publicId}`);

        const result = await cloudinary.uploader.destroy(publicId);

        if (result.result === 'ok' || result.result === 'not found') {
            res.json({ success: true });
        } else {
            console.warn("Cloudinary delete warning:", result);
            res.json({ success: true, message: 'Removed from client, cloud status: ' + result.result });
        }
    } catch (e) {
        console.error("Delete file failed", e);
        res.status(500).json({ success: false, message: 'Server delete failed' });
    }
});


// Login
app.post('/api/login', (req, res) => {
    const { id, password } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === id && u.password === password);

    if (user) {
        // Return user without password for security in frontend state (optional, but good practice)
        // For simplicity, we return what the frontend expects.
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Get Users (Admin only - middleware omitted for simplicity, but logic exists in frontend)
app.get('/api/users', (req, res) => {
    const users = readJSON(USERS_FILE);
    res.json(users);
});

// Add User
app.post('/api/users', (req, res) => {
    const users = readJSON(USERS_FILE);
    const { id, name, role, password } = req.body;

    if (users.some(u => u.id === id)) {
        return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const newUser = { id, name, role, password };
    users.push(newUser);
    if (writeJSON(USERS_FILE, users)) {
        res.json({ success: true, user: newUser });
    } else {
        res.status(500).json({ success: false, message: 'Failed to save user' });
    }
});

// Delete User
app.delete('/api/users/:id', (req, res) => {
    const { id } = req.params;
    let users = readJSON(USERS_FILE);
    const initialLength = users.length;
    users = users.filter(u => u.id !== id);

    if (users.length < initialLength) {
        writeJSON(USERS_FILE, users);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'User not found' });
    }
});

// Get Game State
app.get('/api/game/:userId', (req, res) => {
    const { userId } = req.params;
    const gameStates = readJSON(GAMESTATES_FILE, {});
    const state = gameStates[userId] || null;
    res.json({ success: true, state });
});

// Save Game State
app.post('/api/game/:userId', (req, res) => {
    const { userId } = req.params;
    const state = req.body;
    const gameStates = readJSON(GAMESTATES_FILE, {});

    gameStates[userId] = state;

    if (writeJSON(GAMESTATES_FILE, gameStates)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ success: false, message: 'Failed to save game state' });
    }
});

// Get All Game States (For Admin Report)
app.get('/api/all-gamestates', (req, res) => {
    const gameStates = readJSON(GAMESTATES_FILE, {});
    res.json(gameStates);
});

// Initialize Default Data if missing
if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = [
        { id: '000000', name: 'System Admin', role: 'admin', password: '000000' },
        { id: '600996', name: 'Pornsit', role: 'manager', password: '123456' },
        { id: '600997', name: 'User 600997', role: 'manager', password: '123456' },
        { id: '600998', name: 'User 600998', role: 'manager', password: '123456' },
        { id: '600999', name: 'User 600999', role: 'manager', password: '123456' }
    ];
    writeJSON(USERS_FILE, defaultUsers);
    console.log('Initialized users.json');
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
