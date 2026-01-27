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

// Upload Image Endpoint
app.post('/api/upload', (req, res) => {
    const { userId, image } = req.body;

    if (!userId || !image) {
        return res.status(400).json({ success: false, message: 'Missing userId or image' });
    }

    try {
        // Ensure user folder exists
        const userFolder = path.join(UPLOAD_DIR, userId);
        if (!fs.existsSync(userFolder)) {
            fs.mkdirSync(userFolder, { recursive: true });
        }

        // Decode Base64
        const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ success: false, message: 'Invalid image data' });
        }

        const imageBuffer = Buffer.from(matches[2], 'base64');
        const fileName = `${Date.now()}.jpg`;
        const filePath = path.join(userFolder, fileName);

        fs.writeFileSync(filePath, imageBuffer);

        // Return the URL
        const fileUrl = `/uploads/${userId}/${fileName}`;
        res.json({ success: true, url: fileUrl });

    } catch (e) {
        console.error("Upload failed", e);
        res.status(500).json({ success: false, message: 'Server upload failed' });
    }
});

// Delete Image Endpoint
app.delete('/api/upload', (req, res) => {
    const { userId, url } = req.body;

    if (!userId || !url) {
        return res.status(400).json({ success: false, message: 'Missing userId or url' });
    }

    try {
        // Extract filename from URL (e.g., /uploads/123456/173...jpg -> 173...jpg)
        const parts = url.split('/');
        const fileName = parts.pop();

        // Security check: Ensure userId in URL matches requested userId (basic check)
        const checkUserId = parts.pop();
        if (checkUserId !== userId) {
            return res.status(403).json({ success: false, message: 'Unauthorized file deletion' });
        }

        const filePath = path.join(UPLOAD_DIR, userId, fileName);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true });
        } else {
            // File not found is technically success for "delete" intent
            res.json({ success: true, message: 'File already gone' });
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
