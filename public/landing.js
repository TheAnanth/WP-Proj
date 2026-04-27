const { createApp, ref, onMounted, watch } = Vue;

createApp({
    setup() {
        const showRegister = ref(false);
        const loading = ref(false);
        const errorMsg = ref('');
        const isDark = ref(false);
        
        const form = ref({
            name: '',
            email: '',
            password: ''
        });

        // Redirect if already logged in
        onMounted(() => {
            const user = localStorage.getItem('smartsync_user');
            if (user) {
                window.location.href = 'index.html';
            }

            // Init dark mode
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                isDark.value = true;
                document.documentElement.setAttribute('data-bs-theme', 'dark');
            }
        });

        watch(showRegister, () => {
            errorMsg.value = '';
            form.value.password = '';
        });

        const toggleDarkMode = () => {
            isDark.value = !isDark.value;
            if (isDark.value) {
                document.documentElement.setAttribute('data-bs-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-bs-theme');
                localStorage.setItem('theme', 'light');
            }
        };

        const handleSubmit = async () => {
            errorMsg.value = '';
            loading.value = true;
            
            const endpoint = showRegister.value ? '/api/auth/register' : '/api/auth/login';
            
            // Client-side regex check (federated validation)
            if (showRegister.value) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/;
                
                if (!emailRegex.test(form.value.email)) {
                    errorMsg.value = "Please enter a valid email format.";
                    loading.value = false;
                    return;
                }
                if (!passwordRegex.test(form.value.password)) {
                    errorMsg.value = "Password must be at least 6 characters, containing letters and numbers.";
                    loading.value = false;
                    return;
                }
            }

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(form.value)
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    errorMsg.value = data.error || 'Authentication failed.';
                } else {
                    // Save mock token/user to localStorage
                    localStorage.setItem('smartsync_user', JSON.stringify(data.user));
                    localStorage.setItem('smartsync_token', data.token);
                    // Redirect to dashboard
                    window.location.href = 'index.html';
                }
            } catch (err) {
                errorMsg.value = 'Network error. Please ensure the backend is running.';
            } finally {
                loading.value = false;
            }
        };

        return {
            showRegister,
            form,
            loading,
            errorMsg,
            isDark,
            toggleDarkMode,
            handleSubmit
        };
    }
}).mount('#landing-app');
