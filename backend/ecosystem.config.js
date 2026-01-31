module.exports = {
    apps: [{
        name: "document-search-api",
        script: "./server.js",
        env: {
            NODE_ENV: "production",
            PORT: 5001,
            // Add other environment variables here if needed
            // or rely on .env file
        },
        instances: 1,
        exec_mode: "fork"
    }]
}
