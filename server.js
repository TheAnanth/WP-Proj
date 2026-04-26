

const express = require('express');

const { MongoClient, ObjectId } = require('mongodb');

const cors = require('cors');

require('dotenv').config();

const app = express();

const PORT = 3000;

app.use(cors());

app.use(express.json());

app.use(express.static('public'));

const mongoURI = process.env.MONGO_URI;

const dbName = 'smartsyncDB';

let db;

let useMemoryStore = true;

let memoryDevices = [];
let memoryAlerts = [];

function getDefaultDevices() {
    return [
        { _id: 'dev-1', name: 'Front Door Camera', type: 'camera', isOn: true, ipAddress: '192.168.1.10' },
        { _id: 'dev-2', name: 'Living Room Lock', type: 'lock', isOn: false, ipAddress: '192.168.1.11' },
        { _id: 'dev-3', name: 'Smart Thermostat', type: 'thermostat', isOn: true, value: 22, ipAddress: '192.168.1.12' },
        { _id: 'dev-4', name: 'Bedroom Light', type: 'light', isOn: false, ipAddress: '192.168.1.13' }
    ];
}

function seedMemoryStore() {
    if (memoryDevices.length === 0) {
        memoryDevices = getDefaultDevices();
    }
}

function addAlert(message) {
    const now = new Date();
    memoryAlerts.unshift({
        _id: `alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        message,
        timestamp: now
    });

    memoryAlerts = memoryAlerts.slice(0, 50);
}

seedMemoryStore();

MongoClient.connect(mongoURI)
    .then(client => {
        console.log('✅ Connected to MongoDB Successfully!');

        db = client.db(dbName);
        useMemoryStore = false;

        initializeDatabase();
    })
    .catch(error => {
        console.error('❌ MongoDB Connection Error:', error.message);
        console.warn('⚠️ Falling back to in-memory data store. Data will reset when server restarts.');
        useMemoryStore = true;
        seedMemoryStore();
    });

app.get('/api/devices', async (req, res) => {
    try {
        if (useMemoryStore) {
            return res.json(memoryDevices);
        }

        const devices = await db.collection('devices').find().toArray();
        res.json(devices);
    } catch (err) {

        res.status(500).json({ error: err.message });
    }
});

app.get('/api/devices/stats', async (req, res) => {
    try {
        if (useMemoryStore) {
            const total = memoryDevices.length;

            const active = memoryDevices.filter(d => d.isOn).length;
            return res.json({ total, active, offline: total - active });
        }

        const total = await db.collection('devices').countDocuments({});

        const active = await db.collection('devices').countDocuments({ isOn: true });
        res.json({ total, active, offline: total - active });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/devices/toggle', async (req, res) => {
    try {

        const { deviceId, newState, name } = req.body;

        if (useMemoryStore) {

            const device = memoryDevices.find(d => d._id === deviceId);
            if (!device) {
                return res.status(404).json({ error: 'Device not found' });
            }
            device.isOn = newState;
            const statusText = newState ? 'turned ON' : 'turned OFF';
            addAlert(`${name} was ${statusText}.`);
            return res.json({ success: true });
        }

        await db.collection('devices').updateOne(
            { _id: new ObjectId(deviceId) },
            { $set: { isOn: newState } }
        );

        const statusText = newState ? 'turned ON' : 'turned OFF';
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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

app.get('/api/alerts', async (req, res) => {
    try {
        if (useMemoryStore) {

            return res.json(memoryAlerts.slice(0, 10));
        }
        const alerts = await db.collection('alerts')
            .find()
            .sort({ timestamp: -1 })
            .limit(10)
            .toArray();
        res.json(alerts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/devices', async (req, res) => {
    try {

        const newDevice = {
            name: req.body.name,
            type: req.body.type,
            ipAddress: req.body.ipAddress,
            isOn: false,

            value: req.body.type === 'thermostat' ? 21 : null
        };

        if (useMemoryStore) {
            const createdDevice = {
                ...newDevice,
                _id: `dev-${Date.now()}`
            };
            memoryDevices.push(createdDevice);
            addAlert(`New device added: ${newDevice.name}`);
            return res.json({ success: true, insertedId: createdDevice._id });
        }

        const result = await db.collection('devices').insertOne(newDevice);

        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        await db.collection('alerts').insertOne({
            time: now,
            message: `New device added: ${newDevice.name}`,
            timestamp: new Date()
        });

        res.json({ success: true, insertedId: result.insertedId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/devices/:id', async (req, res) => {
    try {
        const deviceId = req.params.id;

        const updates = req.body;

        if (useMemoryStore) {
            const device = memoryDevices.find(d => d._id === deviceId);
            if (!device) {
                return res.status(404).json({ error: 'Device not found' });
            }

            Object.assign(device, updates);
            if (updates.value !== undefined) {
                addAlert(`${device.name} temperature set to ${updates.value}°C.`);
            }
            return res.json({ success: true });
        }

        await db.collection('devices').updateOne(
            { _id: new ObjectId(deviceId) },
            { $set: updates }
        );

        if (updates.value !== undefined) {
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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

app.delete('/api/devices/:id', async (req, res) => {
    try {
        const deviceId = req.params.id;

        if (useMemoryStore) {
            const before = memoryDevices.length;

            memoryDevices = memoryDevices.filter(device => device._id !== deviceId);
            if (memoryDevices.length === before) {

                return res.status(404).json({ error: 'Device not found' });
            }
            addAlert('A device was removed.');
            return res.json({ success: true });
        }

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

app.post('/api/devices/import', async (req, res) => {
    try {
        const importedDevices = req.body;

        if (!Array.isArray(importedDevices) || importedDevices.length === 0) {
            return res.status(400).json({ error: 'Request body must be a non-empty array of devices.' });
        }

        const cleanDevices = importedDevices.map(d => ({
            name: d.name || 'Unnamed Device',
            type: ['light', 'lock', 'camera', 'thermostat', 'other'].includes(d.type) ? d.type : 'other',
            ipAddress: d.ipAddress || '0.0.0.0',
            isOn: false,
            value: d.type === 'thermostat' ? (d.value || 21) : null
        }));

        if (useMemoryStore) {

            cleanDevices.forEach(d => {
                d._id = `dev-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                memoryDevices.push(d);
            });
            addAlert(`${cleanDevices.length} device(s) imported successfully.`);
            return res.json({ success: true, count: cleanDevices.length });
        }

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

app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, email, and message are required.' });
        }

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

            console.log('📩 Contact form submission (in-memory):', contactMessage);
            return res.json({ success: true, message: 'Message received! We will get back to you soon.' });
        }

        await db.collection('messages').insertOne(contactMessage);
        res.json({ success: true, message: 'Message received! We will get back to you soon.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

async function initializeDatabase() {

    const count = await db.collection('devices').countDocuments();
    if (count === 0) {

        await db.collection('devices').insertMany([
            { name: 'Front Door Camera', type: 'camera', isOn: true, ipAddress: '192.168.1.10' },
            { name: 'Living Room Lock', type: 'lock', isOn: false, ipAddress: '192.168.1.11' },
            { name: 'Smart Thermostat', type: 'thermostat', isOn: true, value: 22, ipAddress: '192.168.1.12' },
            { name: 'Bedroom Light', type: 'light', isOn: false, ipAddress: '192.168.1.13' }
        ]);
        console.log('Inserted default devices into MongoDB.');
    }

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