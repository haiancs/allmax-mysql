const path = require('path');
const swaggerSpec = require('../swagger');
const fs = require('fs');

const outputPath = path.join(__dirname, '../swagger.json');

fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));
console.log(`Swagger JSON generated at ${outputPath}`);
