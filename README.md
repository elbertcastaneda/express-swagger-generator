### Express Swagger Generator

#### Installation

```
npm i express-swagger-generator --save-dev
npm -i express-swaggerize-ui --save-dev
```

#### Usage

```
const express = require('express');
const app = express();
const expressSwaggerGenerator = require('express-swagger-generator');
const swaggerUi = require('express-swaggerize-ui');

export const Router = express.Router;

let options = {
  swaggerDefinition: {
    info: {
      description: 'This is a sample server',
      title: 'Swagger',
      version: '1.0.0',
    },
    host: 'localhost:3000',
    basePath: '/v1',
    produces: [
      "application/json",
      "application/xml"
    ],
    schemes: ['http', 'https'],
    securityDefinitions: {
      JWT: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description: "",
      }
    }
  },
  basedir: __dirname, //app absolute path
  files: ['./routes/**/*.js'], //Path to the API handle folder
  formatterDescriptions: (description = '') => {
    // You can format or add process to descriptions
  }
};

let swaggerObject = null;
expressSwaggerGenerator(options)
  .then(swObj => {
    swaggerObject = swObj;
  });

const router = new Router();

router.use('/api-docs.json', function (req, res) {
  res.json(swaggerObject);
});
router.use('/api-docs', swaggerUi({
  docs: '/api-docs.json' // from the express route above.
}));

app.use([
  router,
]);

```

Open http://<app_host>:<app_port>/api-docs in your browser to view the documentation.

#### How to document the API

```
/**
 * This function comment is parsed by doctrine
 * @route GET /api
 * @group foo - Operations about user
 * @param {string} email.query.required - username or email
 * @param {string} password.query.required - user's password.
 * @returns {object} 200 - An array of user info
 * @returns {Error}  default - Unexpected error
 */
exports.foo = function() {}
```

For model definitions:

```
/**
 * @typedef Product
 * @swaggermodel
 * @property {integer} id
 * @property {string} name.required - Some description for product
 * @property {Array.<Point>} Point
 */

/**
 * @typedef ProductWithNativeTypes
 * @swaggermodel
 * @property {number} id
 *   ```yaml-swagger-settings
 *   propertyType: integer
 *   ```
 * @property {string} name
 *   ```yaml-swagger-settings
 *   required: true
 *   ```
 *   Some description for product
 * @property {Array.<Point>} Point
 */

/**
 * @typedef Point
 * @swaggermodel
 * @property {integer} x.required
 * @property {integer} y.required - Some description for point
 * @property {string} color
 */
 
 
/**
 * @typedef PointWithNativeTypes
 * @swaggermodel
 * @property {number} x
 *   ```yaml-swagger-settings
 *   required: true
 *   propertyType: integer
 *   ```
 * @property {number} y
 *   ```yaml-swagger-settings
 *   required: true
 *   propertyType: number
 *   ```
 *   Some description for point
 * @property {string} color
 */

/**
 * @typedef Error
 * @property {string} code.required
 */

/**
 * @typedef Response
 * @swaggermodel
 * @property {[integer]} code
 */


/**
 * This function comment is parsed by doctrine
 * sdfkjsldfkj
 * @route POST /users
 * @param {Point.model} point.body.required - the new point
 * @group foo - Operations about user
 * @param {string} email.query.required - username or email
 * @param {string} password.query.required - user's password.
 * @operationId retrieveFooInfo
 * @produces application/json application/xml
 * @consumes application/json application/xml
 * @returns {Response.model} 200 - An array of user info
 * @returns {Product.model}  default - Unexpected error
 * @headers {integer} 200.X-Rate-Limit - calls per hour allowed by the user
 * @headers {string} 200.X-Expires-After - 	date in UTC when token expires
 * @security JWT
 */
```

#### More

This module is based on [express-swaggerize-ui](https://github.com/pgroot/express-swaggerize-ui) and [Doctrine-File](https://github.com/researchgate/doctrine-file)
