const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Allmax Backend API',
      version: '1.0.0',
      description: 'API documentation for Allmax Backend',
    },
    servers: [
      {
        url: '/api',
        description: 'Main API server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: [
    './routes/*.js',
    './routes/**/*.js',
    './integrations/**/routes/*.js',
  ], // Files containing annotations
};

const openapiSpecification = swaggerJsdoc(options);

module.exports = openapiSpecification;
