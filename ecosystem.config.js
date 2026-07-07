module.exports = {
  apps: [
    {
      name: 'wedding-management',
      script: 'server.js',
      env_file: '.env',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
