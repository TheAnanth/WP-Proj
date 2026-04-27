

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
            currentUser: null,
            showProfileMenu: false,
            devices: [],
            alerts: [],
            stats: {
                total: 0,
                active: 0,
                offline: 0
            },

            newDevice: { name: '', type: '', subType: '', ipAddress: '' },
            formError: '',
            editDevice: null,
            editFormError: '',
            deviceSubtypes: {
                light: ['LED', 'Incandescent', 'Halogen'],
                thermostat: ['Central', 'Window', 'Radiator'],
                fan: ['Ceiling', 'Tower', 'Exhaust'],
                fridge: ['Mini', 'Standard', 'Commercial'],
                washer: ['Front Load', 'Top Load', 'Compact'],
                dryer: ['Electric', 'Gas', 'Heat Pump'],
                oven: ['Electric', 'Gas', 'Convection'],
                dishwasher: ['Built-in', 'Portable', 'Countertop'],
                vacuum: ['Robot', 'Upright', 'Stick'],
                tv: ['LED', 'OLED', 'QLED'],
                camera: ['Indoor', 'Outdoor', 'Doorbell'],
                speaker: ['Smart', 'Bluetooth', 'Soundbar'],
                purifier: ['HEPA', 'Ionizer', 'UV'],
                blinds: ['Roller', 'Venetian', 'Vertical'],
                sprinkler: ['Oscillating', 'Rotary', 'Drip'],
                mower: ['Electric', 'Gas', 'Robot'],
                pool_pump: ['Single Speed', 'Dual Speed', 'Variable Speed'],
                outdoor_light: ['Floodlight', 'Path Light', 'Spotlight'],
                weather_station: ['Basic', 'Advanced', 'Professional'],
                soil_sensor: ['Moisture', 'pH', 'Nutrient'],
                garage: ['Sectional', 'Roll-up', 'Tilt-up'],
                lock: ['Deadbolt', 'Lever', 'Padlock'],
                plug: ['Standard', 'Heavy Duty', 'Outdoor'],
                smoke_detector: ['Photoelectric', 'Ionization', 'Dual Sensor'],
                doorbell: ['Wired', 'Battery', 'Video']
            },

            searchQuery: '',
            filterType: 'all',

            isDark: false,

            tempUnit: '°C',

            chartTimeframe: 'monthly',
            chartInstance: null
        }
    },

    computed: {
        availableSubtypes() {
            if (!this.newDevice.type) return [];
            return this.deviceSubtypes[this.newDevice.type] || [];
        },
        editAvailableSubtypes() {
            if (!this.editDevice || !this.editDevice.type) return [];
            return this.deviceSubtypes[this.editDevice.type] || [];
        },

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
        this.checkSession();
        this.fetchDevices();
        this.fetchAlerts();
        this.fetchStats();
        this.loadDarkMode();
    },

    methods: {
        checkSession() {
            const userStr = localStorage.getItem('smartsync_user');
            if (!userStr) {
                // If not logged in, redirect to landing page
                window.location.href = 'landing.html';
                return;
            }
            try {
                this.currentUser = JSON.parse(userStr);
            } catch (e) {
                this.logout();
            }
        },

        logout() {
            localStorage.removeItem('smartsync_user');
            window.location.href = 'landing.html';
        },

        async deleteAccount() {
            if (!this.currentUser || !this.currentUser._id) return;
            
            if (!confirm("Are you sure you want to permanently delete your account? This action cannot be undone.")) {
                return;
            }

            try {
                const response = await fetch(`/api/users/${this.currentUser._id}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    this.logout();
                } else {
                    const data = await response.json();
                    alert(data.error || 'Failed to delete account.');
                }
            } catch (error) {
                console.error("Error deleting account:", error);
                alert("Network error. Please try again.");
            }
        },

        openEditModal(device) {
            this.editDevice = { ...device };
            this.editFormError = '';
            const modalEl = document.getElementById('editDeviceModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                modal.show();
            }
        },

        async saveDeviceEdit() {
            this.editFormError = '';
            if (!this.editDevice.name || !this.editDevice.ipAddress) {
                this.editFormError = 'Name and IP are required.';
                return;
            }
            if (this.editDevice.name.length < 3) {
                this.editFormError = 'Name must be at least 3 characters.';
                return;
            }
            if (!this.validateIP(this.editDevice.ipAddress)) {
                this.editFormError = 'Invalid IP address format.';
                return;
            }
            try {
                const { _id, ...updates } = this.editDevice;
                const response = await fetch('/api/devices/' + _id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });
                if (response.ok) {
                    this.refreshAll();
                    const modalEl = document.getElementById('editDeviceModal');
                    const modalInstance = bootstrap.Modal.getInstance(modalEl);
                    if (modalInstance) {
                        modalInstance.hide();
                    }
                    this.editDevice = null;
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    this.editFormError = errorData.error || 'Failed to update device.';
                }
            } catch (error) {
                console.error('Error updating device:', error);
                this.editFormError = 'An unexpected error occurred.';
            }
        },

        async fetchDevices() {
            try {

                const response = await fetch('/api/devices');

                this.devices = await response.json();
                if (document.getElementById('energyChart')) {
                    this.renderChart();
                }
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
        plug: '🔌',
        speaker: '🔊',
        tv: '📺',
        fan: '💨',
        purifier: '🍃',
        blinds: '🪟',
        fridge: '❄️',
        washer: '🧺',
        dryer: '☀️',
        oven: '🔥',
        dishwasher: '🍽️',
        vacuum: '🤖',
        sprinkler: '💦',
        mower: '🚜',
        pool_pump: '🏊',
        outdoor_light: '🏮',
        weather_station: '⛅',
        soil_sensor: '🌱',
        doorbell: '🔔',
        smoke_detector: '🚨',
        garage: '🚪',
        other: '❓'
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
            
            if (document.getElementById('energyChart')) {
                this.renderChart();
            }
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
        },

        renderChart() {
            const ctx = document.getElementById('energyChart');
            if (!ctx) return;

            if (this.chartInstance) {
                this.chartInstance.destroy();
            }            // Define base daily consumption in kWh
            const baseRates = {
                light: 0.05,
                lock: 0.005,
                camera: 0.15,
                thermostat: 0.05,
                plug: 0.1,
                speaker: 0.05,
                tv: 0.5,
                fan: 0.2,
                purifier: 0.4,
                blinds: 0.01,
                fridge: 1.5,
                washer: 0.5,
                dryer: 2.5,
                oven: 1.0,
                dishwasher: 1.2,
                vacuum: 0.2,
                sprinkler: 0.02,
                mower: 0.3,
                pool_pump: 3.0,
                outdoor_light: 0.1,
                weather_station: 0.01,
                soil_sensor: 0.001,
                doorbell: 0.1,
                smoke_detector: 0.001,
                garage: 0.05,
                other: 0.1
            };


            let points, labelPrefix, maxAxis;
            
            if (this.chartTimeframe === 'hourly') {
                points = 24;
                labelPrefix = 'Hour ';
                maxAxis = 24;
            } else if (this.chartTimeframe === 'yearly') {
                points = 12;
                labelPrefix = 'Month ';
                maxAxis = 12;
            } else {
                // monthly
                points = 30;
                labelPrefix = 'Day ';
                maxAxis = 30;
            }

            const xLabels = Array.from({length: points}, (_, i) => i + 1);

            // Generate datasets
            const datasets = this.devices.map((device, index) => {
                const dailyRate = baseRates[device.type] || 0.1;
                
                let data = [];
                for (let i = 1; i <= points; i++) {
                    let consumption = 0;
                    if (this.chartTimeframe === 'hourly') {
                        consumption = (dailyRate / 24) * i; // Cumulative hourly over 1 day
                    } else if (this.chartTimeframe === 'monthly') {
                        consumption = dailyRate * i; // Cumulative daily over 1 month
                    } else {
                        // yearly (months)
                        consumption = (dailyRate * 30) * i; // Cumulative monthly over 1 year
                    }
                    data.push({ x: i, y: parseFloat(consumption.toFixed(4)) });
                }

                const colors = ['#0d6efd', '#198754', '#dc3545', '#ffc107', '#0dcaf0', '#6f42c1', '#fd7e14'];
                const color = colors[index % colors.length];

                return {
                    label: device.name + ' (' + device.type + ')',
                    data: data,
                    borderColor: color,
                    backgroundColor: color,
                    type: 'scatter',
                    showLine: false,
                    pointRadius: 5,
                    pointHoverRadius: 8
                };
            });

            this.chartInstance = new Chart(ctx, {
                data: {
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'linear',
                            position: 'bottom',
                            min: 1,
                            max: maxAxis,
                            title: {
                                display: true,
                                text: this.chartTimeframe.charAt(0).toUpperCase() + this.chartTimeframe.slice(1) + ' Timeline',
                                color: this.isDark ? '#f8f9fa' : '#6c757d'
                            },
                            ticks: {
                                color: this.isDark ? '#ced4da' : '#6c757d'
                            },
                            grid: {
                                color: this.isDark ? '#444' : '#e9ecef'
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Energy (kWh)',
                                color: this.isDark ? '#f8f9fa' : '#6c757d'
                            },
                            ticks: {
                                color: this.isDark ? '#ced4da' : '#6c757d'
                            },
                            grid: {
                                color: this.isDark ? '#444' : '#e9ecef',
                                drawOnChartArea: true
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: {
                                color: this.isDark ? '#f8f9fa' : '#212529'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.dataset.label + ': ' + context.parsed.y + ' kWh';
                                }
                            }
                        }
                    }
                }
            });
        }
    }

}).mount('#app');






