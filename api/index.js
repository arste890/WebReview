// Azure Functions entry point

// Polyfill crypto for Azure SDK compatibility
if (typeof globalThis.crypto === 'undefined') {
    const nodeCrypto = require('crypto');
    globalThis.crypto = {
        randomUUID: () => nodeCrypto.randomUUID(),
        getRandomValues: (arr) => nodeCrypto.randomFillSync(arr)
    };
}

// Import all function registrations
require('./src/functions/auth');
require('./src/functions/users');
require('./src/functions/projects');
require('./src/functions/feedback');
