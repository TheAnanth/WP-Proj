// ============================================================
// SmartSync — Frontend Application Logic
// ============================================================
// This file contains two main sections:
//   1. jQuery (Unit III) — For simple DOM animations
//   2. Vue.js (Unit IV) — For reactive data binding and UI logic
//
// HOW IT ALL CONNECTS:
//   Browser loads index.html → HTML includes this script →
//   Vue.js takes over the #app div → Vue calls our API
//   endpoints (defined in server.js) using fetch() →
//   Server reads/writes to MongoDB → Returns JSON responses →
//   Vue updates the page automatically (reactivity).
// ============================================================


// ==============================================
// JQUERY SECTION (Unit III)
// ==============================================
// jQuery is a JavaScript library that simplifies DOM manipulation.
// $(document).ready() ensures the code runs only AFTER the HTML
// has fully loaded in the browser (so all elements exist).

$(document).ready(function() {

    // --- TOGGLE ALERTS VISIBILITY ---
    // jQuery Event Handling: .click() attaches a click event listener.
    // $(this) refers to the element that was clicked (the button).
    // This demonstrates: Moving/Positioning Elements (Unit III).
    $('#toggle-alerts').click(function() {
        // slideToggle() is a jQuery animation method that smoothly
        // shows/hides an element by sliding it up or down.
        // The 300 parameter is the animation duration in milliseconds.
        $('#alerts-box').slideToggle(300);

        // Toggle the button text between 'Hide' and 'Show'
        let btnText = $(this).text() === 'Hide' ? 'Show' : 'Hide';
        $(this).text(btnText);
    });
});


// ==============================================
// VUE.JS SECTION (Unit IV)
// ==============================================
// Vue.js is a "reactive" framework. This means:
//   - You define your data (state) in the data() function
//   - You bind that data to HTML using {{ }} or v- directives
//   - When the data changes, Vue AUTOMATICALLY updates the HTML
//   - No need to manually find and update DOM elements!

// Destructure the createApp function from the global Vue object.
// This is ES6 destructuring — equivalent to: const createApp = Vue.createApp;
const { createApp } = Vue;

// createApp() creates a new Vue application instance.
// The object we pass in defines the app's data, methods, and behavior.
createApp({

    // --- DATA ---
    // data() returns an object containing ALL the reactive state
    // for this application. Vue watches these properties — when
    // any of them change, any part of the HTML that uses them
    // will automatically re-render.
    data() {
        return {
            devices: [],          // Array of all device objects from the database
            alerts: [],           // Array of recent activity log entries
            stats: {              // Dashboard summary statistics
                total: 0,
                active: 0,
                offline: 0
            },
            // Form data: v-model in the HTML binds to these properties.
            // When the user types into the form, these update automatically.
            newDevice: { name: '', type: '', ipAddress: '' },
            formError: '',        // Validation error message (empty = no error)

            // Search & Filter state
            searchQuery: '',      // Text typed into the search bar
            filterType: 'all',    // Currently selected device type filter

            // Dark mode state
            isDark: false,        // Whether dark mode is currently enabled

            // Temperature unit preference: '°C' (Celsius) or '°F' (Fahrenheit)
            tempUnit: '°C'
        }
    },

    // --- COMPUTED PROPERTIES ---
    // Computed properties are derived values that Vue automatically
    // recalculates whenever their dependencies change.
    // Think of them as "live formulas" — like a spreadsheet cell
    // that updates when its input cells change.
    computed: {

        // filteredDevices: Returns a filtered version of the devices array
        // based on the current search query and type filter.
        // This runs automatically whenever devices, searchQuery, or filterType changes.
        filteredDevices() {
            let result = this.devices;

            // --- TYPE FILTER ---
            // If user selected a specific type (not 'all'), filter by it.
            // Array.filter() returns a new array containing only elements
            // that pass the test (return true).
            if (this.filterType !== 'all') {
                result = result.filter(device => device.type === this.filterType);
            }

            // --- SEARCH FILTER (Unit III: Regular Expressions) ---
            // If the user typed something in the search bar, filter by name.
            // We use a RegExp object for case-insensitive pattern matching.
            if (this.searchQuery.trim() !== '') {
                // 'i' flag makes the regex case-insensitive
                // (so "camera" matches "Camera", "CAMERA", etc.)
                const regex = new RegExp(this.searchQuery.trim(), 'i');
                // .test() returns true if the pattern matches the string
                result = result.filter(device => regex.test(device.name));
            }

            return result;
        }
    },

    // --- MOUNTED LIFECYCLE HOOK ---
    // mounted() is called ONCE when the Vue app is first inserted
    // into the DOM. It's the ideal place to fetch initial data
    // from our API, like loading devices when the page opens.
    mounted() {
        this.fetchDevices();
        this.fetchAlerts();
        this.fetchStats();
        this.loadDarkMode();   // Restore dark mode preference from localStorage
    },

    // --- METHODS ---
    // Methods are functions you can call from the HTML (via @click, etc.)
    // or from other methods. Unlike computed properties, methods only
    // run when explicitly called — they don't auto-recalculate.
    methods: {

        // ==========================================
        // DATA FETCHING (API Communication)
        // ==========================================
        // fetch() is a built-in browser API for making HTTP requests.
        // It returns a Promise, so we use async/await to handle it.
        // async: marks a function as asynchronous
        // await: pauses execution until the Promise resolves

        // Fetch all devices from our Express API
        async fetchDevices() {
            try {
                // fetch() sends an HTTP GET request to our server's /api/devices endpoint
                const response = await fetch('/api/devices');
                // response.json() parses the JSON string from the server
                // into a JavaScript array/object we can work with
                this.devices = await response.json();
            } catch (error) {
                console.error("Error fetching devices:", error);
            }
        },

        // Fetch recent alerts from our Express API
        async fetchAlerts() {
            try {
                const response = await fetch('/api/alerts');
                this.alerts = await response.json();
            } catch (error) {
                console.error("Error fetching alerts:", error);
            }
        },

        // Fetch device statistics (total, active, offline counts)
        async fetchStats() {
            try {
                const response = await fetch('/api/devices/stats');
                this.stats = await response.json();
            } catch (error) {
                console.error("Error fetching stats:", error);
            }
        },

        // Helper: refreshes all data from the server.
        // Called after any action that changes device state.
        refreshAll() {
            this.fetchDevices();
            this.fetchAlerts();
            this.fetchStats();
        },

        // ==========================================
        // FORM VALIDATION (Unit III: Regular Expressions)
        // ==========================================

        // Validates an IPv4 address using a Regular Expression.
        // RegExp breakdown:
        //   ^           → Start of string
        //   (25[0-5]|   → Matches 250-255
        //   2[0-4][0-9]|→ Matches 200-249
        //   [01]?[0-9][0-9]?) → Matches 0-199
        //   \.          → Escaped dot (literal period)
        //   Repeated 4 times for each octet (xxx.xxx.xxx.xxx)
        //   $           → End of string
        validateIP(ip) {
            const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            // .test() returns true if the regex matches the string, false otherwise
            return ipRegex.test(ip);
        },

        // ==========================================
        // CRUD OPERATIONS
        // ==========================================

        // --- CREATE: Add a new device ---
        async addNewDevice() {
            // Clear any previous error message
            this.formError = '';

            // Validate IP before sending to the server
            if (!this.validateIP(this.newDevice.ipAddress)) {
                this.formError = "Invalid IP Address format! Must be like 192.168.1.10";
                return;  // Stop here — don't send the request
            }

            try {
                // HTTP POST request: sends data TO the server to create something.
                // We must include:
                //   method: 'POST' (default is GET)
                //   headers: tell the server we're sending JSON
                //   body: the actual data, converted from JS object to JSON string
                const response = await fetch('/api/devices', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.newDevice)
                });
                
                if (response.ok) {
                    // Reset the form fields to empty values
                    this.newDevice = { name: '', type: '', ipAddress: '' };
                    // Refresh all data to show the new device + alert
                    this.refreshAll();
                }
            } catch (error) {
                console.error("Failed to add device:", error);
            }
        },

        // --- DELETE: Remove a device by its ID ---
        async deleteDevice(deviceId) {
            // confirm() shows a browser dialog asking the user to confirm.
            // It returns true if they click OK, false if they click Cancel.
            if (!confirm("Are you sure you want to delete this device?")) return;

            try {
                // HTTP DELETE request: template literal (backticks) lets us
                // embed the deviceId variable directly in the URL string.
                await fetch(`/api/devices/${deviceId}`, { method: 'DELETE' });
                // Refresh all data to remove the deleted device from the UI
                this.refreshAll();
            } catch (error) {
                console.error("Failed to delete device:", error);
            }
        },

        // --- UPDATE: Toggle a device's ON/OFF state ---
        async toggleDevice(deviceId) {
            // Find the device in our local array by its ID
            const device = this.devices.find(d => d._id === deviceId);
            if (!device) return;

            const newState = !device.isOn;

            // OPTIMISTIC UPDATE: We update the UI immediately BEFORE
            // the server responds. This makes the app feel snappy.
            // If the server request fails, we revert the change.
            device.isOn = newState;
            
            try {
                await fetch('/api/devices/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // JSON.stringify() converts a JS object into a JSON string.
                    // This is required because HTTP can only send text, not objects.
                    body: JSON.stringify({ 
                        deviceId: device._id, 
                        newState: newState,
                        name: device.name
                    })
                });
                // Refresh alerts and stats to reflect the change
                this.fetchAlerts();
                this.fetchStats();
            } catch (error) {
                // REVERT: If the server request failed, undo the optimistic update
                device.isOn = !newState;
                console.error("Failed to toggle:", error);
            }
        },

        // --- UPDATE: Set thermostat temperature ---
        // Sends a PUT request to update the device's value in the database.
        // PUT is the standard HTTP method for updating existing resources.
        async updateDevice(device) {
            try {
                const response = await fetch(`/api/devices/${device._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value: device.value })
                });

                if (response.ok) {
                    // Refresh alerts to show the temperature change log
                    this.fetchAlerts();
                }
            } catch (error) {
                console.error("Failed to update device:", error);
            }
        },

        // ==========================================
        // UTILITY METHODS
        // ==========================================

        // Returns an emoji icon based on the device type.
        // This is called in the HTML template for each device card.
        deviceIcon(type) {
            // Object lookup: cleaner alternative to if/else or switch
            const icons = {
                light: '💡',
                lock: '🔒',
                camera: '📷',
                thermostat: '🌡️',
                other: '🔌'
            };
            // Return the matching icon, or a default if type is unknown
            return icons[type] || '📱';
        },

        // ==========================================
        // TEMPERATURE CONVERSION (°C ↔ °F)
        // ==========================================

        // Converts the stored Celsius value to the currently selected unit
        // for display in the thermostat input field.
        // Formula: °F = (°C × 9/5) + 32
        displayTemp(celsiusValue) {
            if (this.tempUnit === '°F') {
                return Math.round((celsiusValue * 9 / 5) + 32);
            }
            return celsiusValue;
        },

        // Called when the user types into the thermostat input.
        // Converts the input value back to Celsius for storage,
        // since the database always stores temperatures in °C.
        // Formula: °C = (°F − 32) × 5/9
        setTempFromInput(device, inputValue) {
            const num = parseFloat(inputValue);
            if (isNaN(num)) return;
            if (this.tempUnit === '°F') {
                device.value = Math.round((num - 32) * 5 / 9);
            } else {
                device.value = num;
            }
        },

        // Toggles the temperature display unit between °C and °F.
        // The stored value in the database always remains in Celsius;
        // only the display/input changes.
        toggleTempUnit() {
            this.tempUnit = this.tempUnit === '°C' ? '°F' : '°C';
        },

        // ==========================================
        // DARK MODE (CSS + localStorage)
        // ==========================================

        // Toggles dark mode on/off and saves the preference.
        toggleDarkMode() {
            this.isDark = !this.isDark;
            // Set Bootstrap 5.3's data-bs-theme attribute on <html>.
            // This tells Bootstrap to switch ALL its component colors to dark variants.
            // Our custom CSS also reads this attribute to switch our CSS variables.
            document.documentElement.setAttribute(
                'data-bs-theme', 
                this.isDark ? 'dark' : 'light'
            );
            // localStorage persists data in the browser even after closing the tab.
            // It stores key-value pairs as strings. We save the user's preference
            // so dark mode stays active when they refresh or revisit the page.
            localStorage.setItem('smartsync-dark-mode', this.isDark);
        },

        // Loads the saved dark mode preference from localStorage.
        // Called once in mounted() when the app first starts.
        loadDarkMode() {
            // localStorage.getItem() returns a string or null if the key doesn't exist.
            // We compare to the string 'true' because localStorage only stores strings.
            const saved = localStorage.getItem('smartsync-dark-mode');
            if (saved === 'true') {
                this.isDark = true;
                document.documentElement.setAttribute('data-bs-theme', 'dark');
            }
        },

        // ==========================================
        // EXPORT & IMPORT (JSON — Unit III)
        // ==========================================

        // Exports all devices as a downloadable .json file.
        // Demonstrates: JSON.stringify() and programmatic file download.
        exportToJSON() {
            // JSON.stringify(data, replacer, spaces):
            //   - data: the JS object/array to convert
            //   - null: no custom replacer function
            //   - 2: indent with 2 spaces for readability
            const jsonString = JSON.stringify(this.devices, null, 2);

            // Create a Blob (Binary Large Object) containing our JSON text.
            // A Blob represents raw file data in the browser's memory.
            const blob = new Blob([jsonString], { type: 'application/json' });

            // URL.createObjectURL() creates a temporary download link
            // pointing to the Blob data (not a real server URL).
            const url = URL.createObjectURL(blob);

            // Programmatically create and click an <a> link to trigger download.
            // This is a standard browser technique for saving files from JS.
            const link = document.createElement('a');
            link.href = url;
            link.download = 'smartsync-devices.json';  // Suggested filename
            link.click();

            // Clean up: release the temporary URL from memory
            URL.revokeObjectURL(url);
        },

        // Imports devices from a .json file selected by the user.
        // Demonstrates: FileReader API, JSON.parse(), and async file handling.
        importJSON(event) {
            // event.target.files is a FileList from the <input type="file">.
            // files[0] is the first (and usually only) selected file.
            const file = event.target.files[0];
            if (!file) return;

            // FileReader is a browser API that reads file contents.
            // It works asynchronously — we set up an onload callback
            // that fires when the file has been fully read into memory.
            const reader = new FileReader();

            // Arrow function: preserves 'this' context (refers to Vue instance).
            // A regular function() {} would lose the Vue 'this' reference.
            reader.onload = async (e) => {
                try {
                    // e.target.result contains the file's text content.
                    // JSON.parse() converts the JSON string back into a JS array/object.
                    // If the file contains invalid JSON, this throws an error.
                    const importedDevices = JSON.parse(e.target.result);

                    // Validate that the parsed data is actually an array
                    if (!Array.isArray(importedDevices)) {
                        alert('Invalid file: must contain a JSON array of devices.');
                        return;
                    }

                    // Send the parsed devices to our bulk import API endpoint
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
                        // If the server returned an error, show its message
                        alert('Import failed: ' + (result.error || 'Unknown error'));
                    }
                } catch (error) {
                    // JSON.parse() errors end up here (malformed JSON file)
                    alert('Error reading file. Make sure it contains valid JSON.');
                    console.error("Import error:", error);
                }
            };

            // readAsText() starts reading the file. When done, the onload
            // callback above will fire with the file contents.
            reader.readAsText(file);

            // Reset the file input so the same file can be re-selected.
            // Without this, selecting the same file again wouldn't trigger 'change'.
            event.target.value = '';
        }
    }

// .mount('#app') tells Vue to take control of the HTML element
// with id="app". Everything inside that element becomes Vue-managed.
}).mount('#app');