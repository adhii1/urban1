/**
 * TORQQ Shared Mobility - Environment Configuration Manager
 * Allows switching between Localhost, Staging, and Production API environments
 */

const TORQQ_ENV = (() => {
    const ENVIRONMENTS = {
        localhost: {
            name: 'Local Development',
            // Resolved at runtime by js/config/apiBase.js so this works whether
            // the backend is serving these pages itself or a separate static
            // server is, and whether you're on this machine or another one on
            // the same network. Never hardcode localhost here again.
            baseUrl: (window.TORQQ_API_BASE || '/api/v1'),
            wsUrl: (window.TORQQ_SOCKET_ORIGIN || window.location.origin),
            useMockData: true,
            debug: true
        },
        staging: {
            name: 'Staging Environment',
            baseUrl: 'https://staging-api.torqq.com/api/v1',
            wsUrl: 'wss://staging-api.torqq.com',
            useMockData: true,
            debug: true
        },
        production: {
            name: 'Production Environment',
            baseUrl: 'https://api.torqq.com/api/v1',
            wsUrl: 'wss://api.torqq.com',
            useMockData: false,
            debug: false
        }
    };

    // Current active environment (default to localhost)
    let currentEnvKey = localStorage.getItem('torqq_env_key') || 'localhost';

    function getActiveEnv() {
        return ENVIRONMENTS[currentEnvKey] || ENVIRONMENTS.localhost;
    }

    function setEnvironment(envKey) {
        if (ENVIRONMENTS[envKey]) {
            currentEnvKey = envKey;
            localStorage.setItem('torqq_env_key', envKey);
            console.log(`[TORQQ Config] Switched environment to: ${ENVIRONMENTS[envKey].name}`);
            window.location.reload();
        } else {
            console.error(`[TORQQ Config] Invalid environment key: ${envKey}`);
        }
    }

    return {
        get current() { return getActiveEnv(); },
        get key() { return currentEnvKey; },
        setEnvironment,
        getAvailableEnvironments: () => ({ ...ENVIRONMENTS })
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TORQQ_ENV;
}
