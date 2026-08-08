/**
 * TORQQ Shared Mobility - Environment Configuration Manager
 * Allows switching between Localhost, Staging, and Production API environments
 */

const TORQQ_ENV = (() => {
    const ENVIRONMENTS = {
        localhost: {
            name: 'Localhost Development',
            baseUrl: 'http://localhost:4000/api/v1',
            wsUrl: 'ws://localhost:4000',
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
