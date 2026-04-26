

$(document).ready(function() {

    $('#toggle-alerts').click(function() {

        $('#alerts-box').slideToggle(300);

        let btnText = $(this).text() === 'Hide' ? 'Show' : 'Hide';
        $(this).text(btnText);
    });
});

const { createApp } = Vue;

const TEMP_MIN_C = 5;
const TEMP_MAX_C = 40;

createApp({

    data() {
        return {
            devices: [],
            alerts: [],
            stats: {
                total: 0,
                active: 0,
                offline: 0
            },

            newDevice: { name: '', type: '', ipAddress: '' },
            formError: '',

            searchQuery: '',
            filterType: 'all',

            isDark: false,

            tempUnit: '°C'
        }
    },

    computed: {

        filteredDevices() {
            let result = this.devices;

            if (this.filterType !== 'all') {
                result = result.filter(device => device.type === this.filterType);
            }

            if (this.searchQuery.trim() !== '') {

                const regex = new RegExp(this.searchQuery.trim(), 'i');

                result = result.filter(device => regex.test(device.name));
            }

            return result;
        },

        minTempInput() {
            return this.tempUnit === '°F' ? this.celsiusToFahrenheit(TEMP_MIN_C) : TEMP_MIN_C;
        },

        maxTempInput() {
            return this.tempUnit === '°F' ? this.celsiusToFahrenheit(TEMP_MAX_C) : TEMP_MAX_C;
        }
    },

    mounted() {
        this.fetchDevices();
        this.fetchAlerts();
        this.fetchStats();
        this.loadDarkMode();
    },

    methods: {

        async fetchDevices() {
            try {

                const response = await fetch('/api/devices');

                this.devices = await response.json();
            } catch (error) {
                console.error("Error fetching devices:", error);
            }
        },

        async fetchAlerts() {
            try {
                const response = await fetch('/api/alerts');
                this.alerts = await response.json();
            } catch (error) {
                console.error("Error fetching alerts:", error);
            }
        },

        async fetchStats() {
            try {
                const response = await fetch('/api/devices/stats');
                this.stats = await response.json();
            } catch (error) {
                console.error("Error fetching stats:", error);
            }
        },

        refreshAll() {
            this.fetchDevices();
            this.fetchAlerts();
            this.fetchStats();
        },

        validateIP(ip) {
            const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

            return ipRegex.test(ip);
        },

        async addNewDevice() {

            this.formError = '';

            if (!this.validateIP(this.newDevice.ipAddress)) {
                this.formError = "Invalid IP Address format! Must be like 192.168.1.10";
                return;
            }

            try {

                const response = await fetch('/api/devices', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.newDevice)
                });

                if (response.ok) {

                    this.newDevice = { name: '', type: '', ipAddress: '' };

                    this.refreshAll();
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    this.formError = errorData.error || 'Failed to add device.';
                }
            } catch (error) {
                console.error("Failed to add device:", error);
                this.formError = 'Failed to add device due to a network error.';
            }
        },

        async deleteDevice(deviceId) {

            if (!confirm("Are you sure you want to delete this device?")) return;

            try {

                await fetch(`/api/devices/${deviceId}`, { method: 'DELETE' });

                this.refreshAll();
            } catch (error) {
                console.error("Failed to delete device:", error);
            }
        },

        async toggleDevice(deviceId) {

            const device = this.devices.find(d => d._id === deviceId);
            if (!device) return;

            const newState = !device.isOn;

            device.isOn = newState;

            try {
                await fetch('/api/devices/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },

                    body: JSON.stringify({
                        deviceId: device._id,
                        newState: newState,
                        name: device.name
                    })
                });

                this.fetchAlerts();
                this.fetchStats();
            } catch (error) {

                device.isOn = !newState;
                console.error("Failed to toggle:", error);
            }
        },

        async updateDevice(device) {
            if (device.type === 'thermostat') {
                device.value = this.clampCelsius(device.value);
            }

            try {
                const response = await fetch(`/api/devices/${device._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value: device.value })
                });

                if (response.ok) {

                    this.fetchAlerts();
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    alert(errorData.error || 'Temperature update failed.');
                }
            } catch (error) {
                console.error("Failed to update device:", error);
            }
        },

        deviceIcon(type) {

            const icons = {
                light: '💡',
                lock: '🔒',
                camera: '📷',
                thermostat: '🌡️',
                other: '🔌'
            };

            return icons[type] || '📱';
        },

        displayTemp(celsiusValue) {
            if (this.tempUnit === '°F') {
                return this.celsiusToFahrenheit(celsiusValue);
            }
            return celsiusValue;
        },

        setTempFromInput(device, inputValue) {
            const num = parseFloat(inputValue);
            if (isNaN(num)) return;

            const celsiusValue = this.tempUnit === '°F'
                ? this.fahrenheitToCelsius(num)
                : num;

            device.value = this.clampCelsius(celsiusValue);
        },

        celsiusToFahrenheit(celsiusValue) {
            return Math.round((celsiusValue * 9 / 5) + 32);
        },

        fahrenheitToCelsius(fahrenheitValue) {
            return Math.round((fahrenheitValue - 32) * 5 / 9);
        },

        clampCelsius(celsiusValue) {
            const roundedValue = Math.round(celsiusValue);
            return Math.min(TEMP_MAX_C, Math.max(TEMP_MIN_C, roundedValue));
        },

        tempRangeLabel() {
            if (this.tempUnit === '°F') {
                return `${this.minTempInput} to ${this.maxTempInput} °F`;
            }
            return `${TEMP_MIN_C} to ${TEMP_MAX_C} °C`;
        },

        toggleTempUnit() {
            this.tempUnit = this.tempUnit === '°C' ? '°F' : '°C';
        },

        toggleDarkMode() {
            this.isDark = !this.isDark;

            document.documentElement.setAttribute(
                'data-bs-theme',
                this.isDark ? 'dark' : 'light'
            );

            localStorage.setItem('smartsync-dark-mode', this.isDark);
        },

        loadDarkMode() {

            const saved = localStorage.getItem('smartsync-dark-mode');
            if (saved === 'true') {
                this.isDark = true;
                document.documentElement.setAttribute('data-bs-theme', 'dark');
            }
        },

        exportToJSON() {

            const jsonString = JSON.stringify(this.devices, null, 2);

            const blob = new Blob([jsonString], { type: 'application/json' });

            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = 'smartsync-devices.json';
            link.click();

            URL.revokeObjectURL(url);
        },

        importJSON(event) {

            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();

            reader.onload = async (e) => {
                try {

                    const importedDevices = JSON.parse(e.target.result);

                    if (!Array.isArray(importedDevices)) {
                        alert('Invalid file: must contain a JSON array of devices.');
                        return;
                    }

                    const response = await fetch('/api/devices/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(importedDevices)
                    });

                    const result = await response.json();

                    if (response.ok) {
                        alert(`Successfully imported ${result.count} device(s)!`);
                        this.refreshAll();
                    } else {

                        alert('Import failed: ' + (result.error || 'Unknown error'));
                    }
                } catch (error) {

                    alert('Error reading file. Make sure it contains valid JSON.');
                    console.error("Import error:", error);
                }
            };

            reader.readAsText(file);

            event.target.value = '';
        }
    }

}).mount('#app');