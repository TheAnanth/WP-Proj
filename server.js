// ============================================================
// SmartSync — Node.js & Express Server (Unit I & V)
// ============================================================
// This file is the "backend" of our application. It runs on
// your computer (the server) and does three main jobs:
//   1. Serves the HTML/CSS/JS files to the browser (static files)
//   2. Provides API endpoints (URLs) that the frontend can call
//      to read/write data
//   3. Connects to MongoDB Atlas (cloud database) to persist data
// ============================================================

// --- IMPORTING REQUIRED PACKAGES ---
// 'require' is Node.js's way of importing external libraries (packages).
// These packages were installed via 'npm install' and live in node_modules/.

const express = require('express');
// Express is a web framework for Node.js. It simplifies creating
// an HTTP server and defining routes (API endpoints).

const { MongoClient, ObjectId } = require('mongodb');
// MongoClient: used to connect to a MongoDB database.
// ObjectId: MongoDB assigns each document a unique '_id' field.
//   When we need to find/update/delete a specific document,
//   we convert the string ID back into an ObjectId object.

const cors = require('cors');
// CORS (Cross-Origin Resource Sharing) middleware.
// By default, browsers block requests from one domain to another.
// This middleware tells the browser: "it's okay, allow requests
// from any origin to reach this server."

require('dotenv').config();
// dotenv reads the '.env' file in our project root and loads
// its key-value pairs into process.env, so we can access
// secrets (like the MongoDB password) without hardcoding them.

// --- SERVER SETUP ---

const app = express();
// Creates an Express application instance. Think of 'app' as
// your server object — you attach routes and middleware to it.

const PORT = 3000;
// The port number our server will listen on.
// You access it at http://localhost:3000

// --- MIDDLEWARE ---
// Middleware are functions that run BEFORE your route handlers.
// They process every incoming request in the order they're defined.

app.use(cors());
// Enable CORS for all routes (allows frontend to call our API)

app.use(express.json());
// Parses incoming JSON request bodies. Without this, req.body
// would be undefined when the frontend sends JSON via POST/PUT.

app.use(express.static('public'));
// Serves static files (index.html, app.js, style.css) from the
// 'public' folder. When someone visits http://localhost:3000,
// Express automatically sends public/index.html.

// --- DATABASE CONFIGURATION ---

const mongoURI = process.env.MONGO_URI;
// The MongoDB connection string, loaded from .env file.
// Format: mongodb+srv://username:password@cluster.mongodb.net/

const dbName = 'smartsyncDB';
// The name of our database within the MongoDB cluster.
// A cluster can hold many databases, each with many collections.

let db;
// Will hold the reference to our database connection once connected.
// We declare it here so all route handlers can access it.

let useMemoryStore = true;
// Flag that determines if we're using MongoDB or the in-memory fallback.
// Starts as true (memory mode) until MongoDB connects successfully.

let memoryDevices = [];
let memoryAlerts = [];
// In-memory arrays that act as a temporary database when MongoDB
// is unavailable. Data stored here is lost when the server restarts.

// --- IN-MEMORY FALLBACK FUNCTIONS ---

// Returns an array of default/sample devices for the in-memory store.
function getDefaultDevices() {
    return [
        { _id: 'dev-1', name: 'Front Door Camera', type: 'camera', isOn: true, ipAddress: '192.168.1.10' },
        { _id: 'dev-2', name: 'Living Room Lock', type: 'lock', isOn: false, ipAddress: '192.168.1.11' },
        { _id: 'dev-3', name: 'Smart Thermostat', type: 'thermostat', isOn: true, value: 22, ipAddress: '192.168.1.12' },
        { _id: 'dev-4', name: 'Bedroom Light', type: 'light', isOn: false, ipAddress: '192.168.1.13' }
    ];
}

// Populates memoryDevices with defaults if it's currently empty.
function seedMemoryStore() {
    if (memoryDevices.length === 0) {
        memoryDevices = getDefaultDevices();
    }
}

// Creates an alert entry and adds it to the front of the alerts array.
// .unshift() adds to the beginning (newest first), and we cap at 50 entries.
function addAlert(message) {
    const now = new Date();
    memoryAlerts.unshift({
        _id: `alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        message,
        timestamp: now
    });
    // Keep only the 50 most recent alerts to prevent unbounded growth
    memoryAlerts = memoryAlerts.slice(0, 50);
}

// Seed the memory store immediately when the server starts
seedMemoryStore();

// --- MONGODB CONNECTION ---
// MongoClient.connect() returns a Promise. We use .then() for success
// and .catch() for failure. This is asynchronous — the server starts
// listening for requests immediately, even before MongoDB connects.

MongoClient.connect(mongoURI)
    .then(client => {
        console.log('✅ Connected to MongoDB Successfully!');
        // client.db() gives us a reference to a specific database
        db = client.db(dbName);
        useMemoryStore = false;
        // Populate the database with sample devices if it's empty
        initializeDatabase();
    })
    .catch(error => {
        console.error('❌ MongoDB Connection Error:', error.message);
        console.warn('⚠️ Falling back to in-memory data store. Data will reset when server restarts.');
        useMemoryStore = true;
        seedMemoryStore();
    });

// ============================================================
// API ENDPOINTS (HTTP Transactions — Unit I)
// ============================================================
// Each endpoint handles a specific HTTP method + URL combination.
// The frontend (app.js) calls these URLs using fetch().
//
// REST API pattern used here:
//   GET    /api/devices        → Read all devices
//   GET    /api/devices/stats  → Read device statistics
//   POST   /api/devices        → Create a new device
//   POST   /api/devices/import → Bulk import devices from JSON
//   PUT    /api/devices/:id    → Update a specific device
//   DELETE /api/devices/:id    → Delete a specific device
//   POST   /api/devices/toggle → Toggle device ON/OFF
//   GET    /api/alerts         → Read recent alerts
// ============================================================

// --- 1. READ: Get all devices ---
// HTTP GET request. The frontend calls this on page load to
// populate the device list. Returns a JSON array of devices.
app.get('/api/devices', async (req, res) => {
    try {
        if (useMemoryStore) {
            return res.json(memoryDevices);
        }
        // MongoDB: .find() returns a cursor, .toArray() converts
        // it into a JavaScript array we can send as JSON
        const devices = await db.collection('devices').find().toArray();
        res.json(devices);
    } catch (err) {
        // 500 = Internal Server Error (something went wrong on our end)
        res.status(500).json({ error: err.message });
    }
});

// --- 2. READ: Get device statistics ---
// Returns counts for total, active, and offline devices.
// Demonstrates MongoDB's countDocuments() with query filters.
app.get('/api/devices/stats', async (req, res) => {
    try {
        if (useMemoryStore) {
            const total = memoryDevices.length;
            // .filter() creates a new array with only items that pass the test
            const active = memoryDevices.filter(d => d.isOn).length;
            return res.json({ total, active, offline: total - active });
        }
        // countDocuments() counts how many documents match the given filter.
        // An empty filter {} matches ALL documents in the collection.
        const total = await db.collection('devices').countDocuments({});
        // { isOn: true } only counts documents where isOn equals true
        const active = await db.collection('devices').countDocuments({ isOn: true });
        res.json({ total, active, offline: total - active });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 3. UPDATE: Toggle a device's ON/OFF status ---
// Uses POST with a JSON body containing deviceId and newState.
// After toggling, it also creates an alert log entry.
app.post('/api/devices/toggle', async (req, res) => {
    try {
        // Destructuring: extracts specific properties from req.body
        const { deviceId, newState, name } = req.body;

        if (useMemoryStore) {
            // .find() on an array returns the first matching element
            const device = memoryDevices.find(d => d._id === deviceId);
            if (!device) {
                return res.status(404).json({ error: 'Device not found' });
            }
            device.isOn = newState;
            const statusText = newState ? 'turned ON' : 'turned OFF';
            addAlert(`${name} was ${statusText}.`);
            return res.json({ success: true });
        }

        // MongoDB updateOne(): first argument is the filter (which document),
        // second argument uses $set operator to update specific fields
        await db.collection('devices').updateOne(
            { _id: new ObjectId(deviceId) },
            { $set: { isOn: newState } }
        );

        const statusText = newState ? 'turned ON' : 'turned OFF';
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Log the action as an alert
        await db.collection('alerts').insertOne({
            time: now,
            message: `${name} was ${statusText}.`,
            timestamp: new Date()
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 4. READ: Get the latest alerts ---
// Uses MongoDB cursor methods: .sort() and .limit() (Unit V).
// sort({ timestamp: -1 }) means newest first (descending order).
// limit(10) restricts the result to 10 documents max.
app.get('/api/alerts', async (req, res) => {
    try {
        if (useMemoryStore) {
            // .slice(0, 10) returns the first 10 elements of the array
            return res.json(memoryAlerts.slice(0, 10));
        }
        const alerts = await db.collection('alerts')
            .find()                     // Get all documents
            .sort({ timestamp: -1 })    // Sort by timestamp, newest first
            .limit(10)                  // Only return the first 10
            .toArray();                 // Convert cursor to array
        res.json(alerts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 5. CREATE: Add a new device ---
// HTTP POST request. The frontend sends a JSON body with
// the new device's name, type, and IP address.
app.post('/api/devices', async (req, res) => {
    try {
        // Build the device object from the request body
        const newDevice = {
            name: req.body.name,
            type: req.body.type,
            ipAddress: req.body.ipAddress,
            isOn: false,
            // Thermostats get a default temperature value; others get null
            value: req.body.type === 'thermostat' ? 21 : null
        };

        if (useMemoryStore) {
            const createdDevice = {
                ...newDevice,  // Spread operator: copies all properties from newDevice
                _id: `dev-${Date.now()}`  // Generate a unique ID using current timestamp
            };
            memoryDevices.push(createdDevice);
            addAlert(`New device added: ${newDevice.name}`);
            return res.json({ success: true, insertedId: createdDevice._id });
        }

        // MongoDB insertOne(): inserts a single document into the collection
        const result = await db.collection('devices').insertOne(newDevice);

        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        await db.collection('alerts').insertOne({
            time: now,
            message: `New device added: ${newDevice.name}`,
            timestamp: new Date()
        });

        // result.insertedId is the auto-generated MongoDB ObjectId
        res.json({ success: true, insertedId: result.insertedId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 6. UPDATE: Update a specific device ---
// HTTP PUT request. Used for updating thermostat temperature
// or any other device property. The :id in the URL is a
// route parameter — Express extracts it into req.params.id.
app.put('/api/devices/:id', async (req, res) => {
    try {
        const deviceId = req.params.id;
        // req.body contains the fields to update (e.g., { value: 25 })
        const updates = req.body;

        if (useMemoryStore) {
            const device = memoryDevices.find(d => d._id === deviceId);
            if (!device) {
                return res.status(404).json({ error: 'Device not found' });
            }
            // Object.assign() merges properties from 'updates' into 'device',
            // overwriting any existing properties with the same name
            Object.assign(device, updates);
            if (updates.value !== undefined) {
                addAlert(`${device.name} temperature set to ${updates.value}°C.`);
            }
            return res.json({ success: true });
        }

        // MongoDB updateOne() with $set: only updates the specified fields,
        // leaving all other fields in the document untouched
        await db.collection('devices').updateOne(
            { _id: new ObjectId(deviceId) },
            { $set: updates }
        );

        // Log thermostat changes as alerts
        if (updates.value !== undefined) {
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            // Fetch the device name for the alert message
            const device = await db.collection('devices').findOne({ _id: new ObjectId(deviceId) });
            await db.collection('alerts').insertOne({
                time: now,
                message: `${device.name} temperature set to ${updates.value}°C.`,
                timestamp: new Date()
            });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 7. DELETE: Remove a device ---
// HTTP DELETE request. The :id route parameter identifies
// which device to remove from the database.
app.delete('/api/devices/:id', async (req, res) => {
    try {
        const deviceId = req.params.id;

        if (useMemoryStore) {
            const before = memoryDevices.length;
            // .filter() keeps only devices whose _id does NOT match
            memoryDevices = memoryDevices.filter(device => device._id !== deviceId);
            if (memoryDevices.length === before) {
                // If the length didn't change, no device was found to remove
                return res.status(404).json({ error: 'Device not found' });
            }
            addAlert('A device was removed.');
            return res.json({ success: true });
        }

        // MongoDB deleteOne(): removes the first document matching the filter
        await db.collection('devices').deleteOne({ _id: new ObjectId(deviceId) });

        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        await db.collection('alerts').insertOne({
            time: now,
            message: 'A device was removed.',
            timestamp: new Date()
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 8. CREATE (Bulk): Import devices from JSON ---
// Accepts an array of device objects and inserts them all at once.
// Demonstrates MongoDB's insertMany() for bulk operations (Unit V).
app.post('/api/devices/import', async (req, res) => {
    try {
        const importedDevices = req.body;

        // Validate that the request body is actually an array
        if (!Array.isArray(importedDevices) || importedDevices.length === 0) {
            return res.status(400).json({ error: 'Request body must be a non-empty array of devices.' });
        }

        // Sanitize each device: only keep the fields we expect,
        // and set default values for missing ones.
        // This prevents malicious or malformed data from entering our DB.
        const cleanDevices = importedDevices.map(d => ({
            name: d.name || 'Unnamed Device',
            type: ['light', 'lock', 'camera', 'thermostat', 'other'].includes(d.type) ? d.type : 'other',
            ipAddress: d.ipAddress || '0.0.0.0',
            isOn: false,
            value: d.type === 'thermostat' ? (d.value || 21) : null
        }));

        if (useMemoryStore) {
            // Add a unique ID to each device and push them all into the array
            cleanDevices.forEach(d => {
                d._id = `dev-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                memoryDevices.push(d);
            });
            addAlert(`${cleanDevices.length} device(s) imported successfully.`);
            return res.json({ success: true, count: cleanDevices.length });
        }

        // MongoDB insertMany(): inserts multiple documents in a single operation.
        // Much faster than calling insertOne() in a loop.
        await db.collection('devices').insertMany(cleanDevices);

        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        await db.collection('alerts').insertOne({
            time: now,
            message: `${cleanDevices.length} device(s) imported successfully.`,
            timestamp: new Date()
        });

        res.json({ success: true, count: cleanDevices.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 9. CREATE: Submit a contact form message ---
// Stores user queries/complaints in a 'messages' collection.
// Demonstrates form handling and MongoDB insertOne (Unit V).
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        // Basic validation: ensure required fields are present
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, email, and message are required.' });
        }

        // Email validation using a Regular Expression (Unit III)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email address format.' });
        }

        const contactMessage = {
            name,
            email,
            subject: subject || 'No Subject',
            message,
            submittedAt: new Date()
        };

        if (useMemoryStore) {
            // In memory mode, just acknowledge receipt
            console.log('📩 Contact form submission (in-memory):', contactMessage);
            return res.json({ success: true, message: 'Message received! We will get back to you soon.' });
        }

        // Store the message in the 'messages' collection in MongoDB
        await db.collection('messages').insertOne(contactMessage);
        res.json({ success: true, message: 'Message received! We will get back to you soon.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- START THE SERVER ---
// app.listen() binds the server to the specified port and starts
// accepting incoming HTTP connections.
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// --- DATABASE INITIALIZATION ---
// This function runs once after a successful MongoDB connection.
// It checks if the 'devices' collection is empty, and if so,
// inserts sample/default devices so the dashboard isn't blank.
async function initializeDatabase() {
    // countDocuments({}) counts ALL documents in the collection
    const count = await db.collection('devices').countDocuments();
    if (count === 0) {
        // insertMany() inserts an array of documents in one operation
        await db.collection('devices').insertMany([
            { name: 'Front Door Camera', type: 'camera', isOn: true, ipAddress: '192.168.1.10' },
            { name: 'Living Room Lock', type: 'lock', isOn: false, ipAddress: '192.168.1.11' },
            { name: 'Smart Thermostat', type: 'thermostat', isOn: true, value: 22, ipAddress: '192.168.1.12' },
            { name: 'Bedroom Light', type: 'light', isOn: false, ipAddress: '192.168.1.13' }
        ]);
        console.log('Inserted default devices into MongoDB.');
    }

    // --- MIGRATION: Patch devices that are missing an IP address ---
    // $exists: false matches documents where the 'ipAddress' field doesn't exist.
    // We assign each one a dummy IP so older records display correctly.
    const devicesWithoutIP = await db.collection('devices')
        .find({ ipAddress: { $exists: false } }).toArray();

    for (let i = 0; i < devicesWithoutIP.length; i++) {
        const dummyIP = `192.168.1.${20 + i}`;
        await db.collection('devices').updateOne(
            { _id: devicesWithoutIP[i]._id },
            { $set: { ipAddress: dummyIP } }
        );
    }

    if (devicesWithoutIP.length > 0) {
        console.log(`✅ Patched ${devicesWithoutIP.length} device(s) with dummy IP addresses.`);
    }
}