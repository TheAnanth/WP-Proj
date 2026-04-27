

const express = require('express');

const { MongoClient, ObjectId } = require('mongodb');

const cors = require('cors');

require('dotenv').config({ quiet: true });

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
let memoryUsers = []; // Stores users in memory if MongoDB is unavailable

const MIN_THERMOSTAT_TEMP_C = 5;
const MAX_THERMOSTAT_TEMP_C = 40;

function normalizeThermostatTemperature(value, fallback = 21) {
    const numericValue = Number(value);
    const safeValue = Number.isFinite(numericValue) ? numericValue : fallback;
    const roundedValue = Math.round(safeValue);
    return Math.min(MAX_THERMOSTAT_TEMP_C, Math.max(MIN_THERMOSTAT_TEMP_C, roundedValue));
}

function isThermostatTemperatureInRange(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue)
        && numericValue >= MIN_THERMOSTAT_TEMP_C
        && numericValue <= MAX_THERMOSTAT_TEMP_C;
}

function normalizeDeviceName(name) {
    return String(name || '').trim().toLowerCase();
}

function normalizeDeviceIPAddress(ipAddress) {
    return String(ipAddress || '').trim();
}

function collectDuplicateDeviceConflicts(existingDevices, candidateDevices) {
    const existingNames = new Set(existingDevices.map(d => normalizeDeviceName(d.name)).filter(Boolean));
    const existingIPs = new Set(existingDevices.map(d => normalizeDeviceIPAddress(d.ipAddress)).filter(Boolean));

    const batchNames = new Set();
    const batchIPs = new Set();

    const conflicts = [];

    candidateDevices.forEach((device, index) => {
        const nameKey = normalizeDeviceName(device.name);
        const ipKey = normalizeDeviceIPAddress(device.ipAddress);

        const hasNameConflict = nameKey && (existingNames.has(nameKey) || batchNames.has(nameKey));
        const hasIPConflict = ipKey && (existingIPs.has(ipKey) || batchIPs.has(ipKey));

        if (hasNameConflict || hasIPConflict) {
            const reasons = [];
            if (hasNameConflict) {
                reasons.push(`duplicate name "${device.name}"`);
            }
            if (hasIPConflict) {
                reasons.push(`duplicate IP "${device.ipAddress}"`);
            }

            conflicts.push({
                index,
                name: device.name,
                ipAddress: device.ipAddress,
                reason: reasons.join(' and ')
            });
        }

        if (nameKey) {
            batchNames.add(nameKey);
        }
        if (ipKey) {
            batchIPs.add(ipKey);
        }
    });

    return conflicts;
}

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
        time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
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
    .catch(() => {
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
        const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

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
            name: String(req.body.name || '').trim(),
            type: req.body.type,
            subType: String(req.body.subType || '').trim(),
            ipAddress: String(req.body.ipAddress || '').trim(),
            isOn: false,

            value: req.body.type === 'thermostat' ? normalizeThermostatTemperature(21) : null
        };

        const existingDevices = useMemoryStore
            ? memoryDevices
            : await db.collection('devices').find({}, { projection: { name: 1, ipAddress: 1 } }).toArray();

        const conflicts = collectDuplicateDeviceConflicts(existingDevices, [newDevice]);
        if (conflicts.length > 0) {
            return res.status(409).json({
                error: `Device already exists: ${conflicts[0].reason}. Device names and IP addresses must be unique.`
            });
        }

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

        const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
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

        const updates = { ...req.body };

        if (useMemoryStore) {
            const device = memoryDevices.find(d => d._id === deviceId);
            if (!device) {
                return res.status(404).json({ error: 'Device not found' });
            }

            if (updates.value !== undefined) {
                if (device.type === 'thermostat') {
                    if (!isThermostatTemperatureInRange(updates.value)) {
                        return res.status(400).json({
                            error: `Temperature must be between ${MIN_THERMOSTAT_TEMP_C}°C and ${MAX_THERMOSTAT_TEMP_C}°C.`
                        });
                    }
                    updates.value = normalizeThermostatTemperature(updates.value);
                }
            }

            Object.assign(device, updates);
            if (updates.value !== undefined) {
                addAlert(`${device.name} temperature set to ${updates.value}°C.`);
            }
            return res.json({ success: true });
        }

        let deviceForAlert = null;

        if (updates.value !== undefined) {
            const device = await db.collection('devices').findOne({ _id: new ObjectId(deviceId) });
            if (!device) {
                return res.status(404).json({ error: 'Device not found' });
            }

            if (device.type === 'thermostat') {
                if (!isThermostatTemperatureInRange(updates.value)) {
                    return res.status(400).json({
                        error: `Temperature must be between ${MIN_THERMOSTAT_TEMP_C}°C and ${MAX_THERMOSTAT_TEMP_C}°C.`
                    });
                }
                updates.value = normalizeThermostatTemperature(updates.value);
            }
            deviceForAlert = device;
        }

        await db.collection('devices').updateOne(
            { _id: new ObjectId(deviceId) },
            { $set: updates }
        );

        if (updates.value !== undefined) {
            const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            await db.collection('alerts').insertOne({
                time: now,
                message: `${deviceForAlert.name} temperature set to ${updates.value}°C.`,
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

        const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
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

        const cleanDevices = importedDevices.map(d => {
            const normalizedType = ['light', 'lock', 'camera', 'thermostat', 'other'].includes(d.type) ? d.type : 'other';

            return {
                name: String(d.name || 'Unnamed Device').trim(),
                type: normalizedType,
                ipAddress: String(d.ipAddress || '0.0.0.0').trim(),
                isOn: false,
                value: normalizedType === 'thermostat'
                    ? normalizeThermostatTemperature(d.value, 21)
                    : null
            };
        });

        const existingDevices = useMemoryStore
            ? memoryDevices
            : await db.collection('devices').find({}, { projection: { name: 1, ipAddress: 1 } }).toArray();

        const duplicateConflicts = collectDuplicateDeviceConflicts(existingDevices, cleanDevices);
        if (duplicateConflicts.length > 0) {
            const formattedConflicts = duplicateConflicts
                .slice(0, 5)
                .map(c => `item ${c.index + 1}: ${c.reason}`)
                .join('; ');

            return res.status(409).json({
                error: `Import blocked due to duplicate devices (${formattedConflicts}). Device names and IP addresses must be unique.`,
                duplicates: duplicateConflicts
            });
        }

        if (useMemoryStore) {

            cleanDevices.forEach(d => {
                d._id = `dev-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                memoryDevices.push(d);
            });
            addAlert(`${cleanDevices.length} device(s) imported successfully.`);
            return res.json({ success: true, count: cleanDevices.length });
        }

        await db.collection('devices').insertMany(cleanDevices);

        const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
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
            return res.json({ success: true, message: 'Message received! We will get back to you soon.' });
        }

        await db.collection('messages').insertOne(contactMessage);
        res.json({ success: true, message: 'Message received! We will get back to you soon.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        // Basic Regex validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        // Password at least 6 characters, one letter and one number
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/;
        
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Name, email, and password are required.' });
        }
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ error: 'Password must be at least 6 characters and contain letters and numbers.' });
        }

        const newUser = {
            name,
            email: email.toLowerCase(),
            password, // Plain text for mock purposes; in production, use bcrypt
            createdAt: new Date()
        };

        if (useMemoryStore) {
            const exists = memoryUsers.find(u => u.email === newUser.email);
            if (exists) return res.status(409).json({ error: 'Email already exists.' });
            
            newUser._id = `user-${Date.now()}`;
            memoryUsers.push(newUser);
            return res.json({ success: true, user: { _id: newUser._id, name: newUser.name, email: newUser.email } });
        }

        const existingUser = await db.collection('users').findOne({ email: newUser.email });
        if (existingUser) return res.status(409).json({ error: 'Email already exists.' });

        const result = await db.collection('users').insertOne(newUser);
        res.json({ success: true, user: { _id: result.insertedId, name: newUser.name, email: newUser.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

        if (useMemoryStore) {
            const user = memoryUsers.find(u => u.email === email.toLowerCase() && u.password === password);
            if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
            return res.json({ success: true, user: { _id: user._id, name: user.name, email: user.email } });
        }

        const user = await db.collection('users').findOne({ email: email.toLowerCase(), password });
        if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
        
        res.json({ success: true, user: { _id: user._id, name: user.name, email: user.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        if (useMemoryStore) {
            const before = memoryUsers.length;
            memoryUsers = memoryUsers.filter(u => u._id !== userId);
            if (memoryUsers.length === before) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.json({ success: true });
        }

        const result = await db.collection('users').deleteOne({ _id: new ObjectId(userId) });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'User not found' });

        res.json({ success: true });
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

    const thermostatDevices = await db.collection('devices')
        .find({ type: 'thermostat' })
        .toArray();

    for (const thermostat of thermostatDevices) {
        const normalizedTemp = normalizeThermostatTemperature(thermostat.value, 21);
        if (thermostat.value !== normalizedTemp) {
            await db.collection('devices').updateOne(
                { _id: thermostat._id },
                { $set: { value: normalizedTemp } }
            );
        }
    }
}