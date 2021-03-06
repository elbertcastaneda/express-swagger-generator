/**
 * Created by GROOT on 3/27 0027.
 */
/** @module index */


// Dependencies
const fs = require('fs');
const glob = require('glob');
const path = require('path');
const yaml = require('js-yaml');
const parser = require('swagger-parser');
const doctrineFile = require('doctrine-file');
const swaggerHelpers = require('./swagger-helpers');

/**
 * Virtual method, the user que overwrite with the options.formatterDescriptions when he use
 * the middleware in the express application.
 *
 * @param {string} description Text description
 * @returns {string} description with the user rules
 */
let formatterDescriptions = function (description) {
  return description;
};

/**
 * Parses the provided API file for JSDoc comments.
 * @function
 * @param {string} file - File to be parsed
 * @returns {object} JSDoc comments
 * @requires doctrine
 */
function parseApiFile(file) {
  const content = fs.readFileSync(file, 'utf-8');

  const comments = doctrineFile.parseFileContent(content, {
    unwrap: true,
    sloppy: true,
    tags: null,
    recoverable: true,
  });
  return comments;
}

function parseRoute(str) {
  const split = str.split(' ');

  return {
    method: split[0].toLowerCase() || 'get',
    uri: split[1] || '',
  };
}

function parseField(str) {
  const split = str.split('.');
  return {
    name: split[0],
    parameter_type: split[1] || 'get',
    required: split[2] && split[2] === 'required' || false,
  };
}

function parseType(obj, settings) {
  settings = settings || {};
  if (!obj) return undefined;
  if (obj.name) {
    const spl = obj.name.split('.');
    if (spl.length > 1 && spl[1] === 'model') {
      return spl[0];
    }
    if (obj.name !== 'void') {
      return obj.name;
    }
    return undefined;
  } if (obj.expression && obj.expression.name) {
    const expressionName = obj.expression.name.toLowerCase();
    if (expressionName !== 'void') {
      return expressionName;
    }
    return undefined;
  }
  return 'string';
}

function parseSchema(obj, settings) {
  settings = settings || {};
  if (!obj.name) return undefined;
  const spl = obj.name.split('.');
  const modelName = settings.modelName || spl[0];
  if ((spl.length > 1 && spl[1] === 'model') || settings.modelName) {
    return {
      $ref: `#/definitions/${modelName}`,
    };
  }
  return undefined;
}

function parseItems(obj) {
  if (obj.applications && obj.applications.length > 0 && obj.applications[0].name) {
    const type = obj.applications[0].name;
    if (type === 'object' || type === 'string' || type === 'integer' || type === 'boolean') {
      return {
        type,
      };
    } return {
      $ref: `#/definitions/${type}`,
    };
  } return undefined;
}

function parseReturn(tags) {
  const rets = {};
  const headers = parseHeaders(tags);

  for (const i in tags) {
    if (tags[i].title === 'returns' || tags[i].title === 'return') {
      const description = tags[i].description.split('-');
      const key = description[0].trim();

      const settingFromDesc = parseSettingsFromDescription(description[1] ? description[1].trim() : '');
      rets[key] = {
        description: formatterDescriptions(settingFromDesc.description),
        headers: headers[key],
      };

      rets[key].schema = {
        type: tags[i].type ? parseType(tags[i].type) : undefined,
        items: (tags[i].type ? parseItems(tags[i].type) : undefined)
            || settingFromDesc.settings.items,
      };

      const type = parseType(tags[i].type);
      if (type) {
        rets[key].schema = { ...rets[key].schema, ...parseSchema(tags[i].type) };

        if (rets[key].schema && rets[key].schema.type !== 'array') {
          delete (rets[key].schema.type);
        }
      }
    }
  }
  return rets;
}

function parseDescription(obj) {
  return formatterDescriptions(obj.description || '');
}

function parseTag(tags) {
  const tagsDef = [];
  for (const i in tags) {
    if (tags[i].title === 'group') {
      tagsDef.push(tags[i].description.split('-'));
    }
  }

  if (tagsDef.length === 0) {
    return [
      ['default', ''],
    ];
  }
  return tagsDef;
}

function parseProduces(str) {
  return str.split(/\s+/);
}


function parseConsumes(str) {
  return str.split(/\s+/);
}

/**
 * Parse settings from description the yaml swagger blocks
 * @param {String} description Description of comment element
 * @returns {Object} Settings founded and description without yaml block.
 */
function parseSettingsFromDescription(description) {
  description = description || '';
  const startBlockSentence = '```yaml-swagger-settings';
  const yamlBlockStart = description.indexOf(startBlockSentence);
  let settings = {};
  if (yamlBlockStart !== -1) {
    const endBlockSentence = '```';
    let yamlBlock = description.slice(yamlBlockStart + startBlockSentence.length);
    const yamlBlockEnd = yamlBlock.indexOf(endBlockSentence);
    if (yamlBlockEnd !== 1) {
      yamlBlock = yamlBlock.slice(0, yamlBlockEnd);
      settings = yaml.safeLoad(yamlBlock);
      // Clean description
      description = description
        .replace(`${startBlockSentence}${yamlBlock}${endBlockSentence}`, '')
        .replace(/\r\n/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/ {2}/g, ' ')
        .trim();
    }
  } else {
    description = description.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/ {2}/g, ' ');
  }

  const setDefaultFromShortDeclarations = function (settings) {
    if (settings.propertyType) {
      settings.propertyType = settings.propertyType.name
        ? settings.propertyType : {
          name: settings.propertyType,
          type: 'NameExpression',
        };
    }

    return settings;
  };

  setDefaultFromShortDeclarations(settings);

  return {
    settings,
    description,
  };
}

function parseTypedef(tags) {
  const typeName = tags[0].name;
  const details = {
    required: [],
    properties: {},
  };
  if (tags[0].type && tags[0].type.name) {
    details.allOf = [{
      $ref: `#/definitions/${tags[0].type.name}`,
    }];
  }
  for (let i = 1; i < tags.length; i++) {
    const tag = tags[i];
    const { description } = tag;
    if (tag.title === 'property') {
      let propName = tag.name;
      const settingFromDesc = parseSettingsFromDescription(description);
      // Establish property type from yaml settings or tag type
      const propType = settingFromDesc.settings.propertyType || tag.type;
      // Establish description without yaml block settings
      tag.description = settingFromDesc.description;
      const required = propName.split('.')[1];
      // If has '.required' is required or if yaml settings.required === true
      if ((required && required === 'required') || settingFromDesc.settings.required) {
        propName = propName.split('.')[0];
        details.required.push(propName);
      }
      const schema = parseSchema(propType, settingFromDesc.settings);
      if (schema) {
        details.properties[propName] = schema;
      } else {
        details.properties[propName] = {
          type: parseType(propType, settingFromDesc.settings),
          description: formatterDescriptions(tag.description || ''),
          items: parseItems(propType) || settingFromDesc.settings.items,
        };
        delete (settingFromDesc.settings.propertyType);
        delete (settingFromDesc.settings.required);
        details.properties[propName] = {
          ...details.properties[propName],
          ...settingFromDesc.settings,
        };
      }
    }
  }

  if (details.required.length === 0) {
    delete (details.required);
  }

  return {
    typeName,
    details,
  };
}

function parseSecurity(comments) {
  let security;
  try {
    security = JSON.parse(comments);
  } catch (e) {
    const obj = {};
    obj[comments] = [];
    security = [
      obj,
    ];
  }
  return security;
}

function parseHeaders(comments) {
  const headers = {};
  for (const i in comments) {
    if (comments[i].title === 'headers' || comments[i].title === 'header') {
      const description = comments[i].description.split(/\s+-\s+/);

      if (description.length < 1) {
        break;
      }
      const code2name = description[0].split('.');

      if (code2name.length < 2) {
        break;
      }

      const type = code2name[0].match(/\w+/);
      const code = code2name[0].match(/\d+/);

      if (!type || !code) {
        break;
      }
      const code0 = code[0].trim();
      if (!headers[code0]) {
        headers[code0] = {};
      }

      headers[code0][code2name[1]] = {
        type: type[0],
        description: description[1],
      };
    }
  }
  return headers;
}

function fileFormat(comments) {
  let route; const parameters = {};
  const params = [];
  let tags = [];
  const definitions = {};
  for (const i in comments) {
    const desc = parseDescription(comments);
    if (i === 'tags') {
      const commentTags = comments[i];
      // Only typedefs marked to swaggermodels
      const isSwaggerModel = commentTags.some(k => k.title === 'swaggermodel');
      const isRoute = commentTags.some(k => k.title === 'route');
      if (!isSwaggerModel && !isRoute) {
        continue;
      }
      if (
        commentTags.length > 0
        && commentTags[0].title
        && commentTags[0].title === 'typedef'
        && isSwaggerModel
      ) {
        const typedefParsed = parseTypedef(commentTags);
        definitions[typedefParsed.typeName] = typedefParsed.details;
        continue;
      }
      for (const j in commentTags) {
        const { title } = commentTags[j];
        let parameterRef = route ? parameters[route.uri] : null;
        if (title === 'route') {
          route = parseRoute(commentTags[j].description);
          const parsedTags = parseTag(commentTags);
          const tag = parsedTags[0];
          parameters[route.uri] = parameterRef || {};
          parameterRef = parameters[route.uri];
          parameterRef[route.method] = parameterRef[route.method] || {};
          parameterRef[route.method].parameters = [];
          parameterRef[route.method].description = formatterDescriptions(desc);
          const flatTags = () => parsedTags.map(([name, description]) => name.trim());
          parameterRef[route.method].tags = parsedTags.length > 1 ? flatTags() : tag[0].trim().split(/\//g);


          tags = [
            ...tags,
            ...parsedTags
              .filter(t => t[0].trim().split(/\//g).length === 1)
              .map(t => ({
                name: typeof t[0] === 'string' ? t[0].trim() : '',
                description: formatterDescriptions(typeof t[1] === 'string' ? t[1].trim() : ''),
              })),
          ];
        }
        if (title === 'param') {
          let descParam = commentTags[j].description;
          const {
            settings,
            description,
          } = parseSettingsFromDescription(descParam);
          descParam = description;
          const field = parseField(commentTags[j].name);
          const properties = {
            ...{
              name: field.name,
              in: field.parameter_type,
              description: formatterDescriptions(descParam),
              required: field.required,
            },
            ...settings,
          };
          const schema = parseSchema(commentTags[j].type);
          // we only want a type if there is no referenced schema
          if (!schema) {
            properties.type = parseType(commentTags[j].type);
            // If type split by dot is greater to 1, send the format attribute
            const splitType = properties.type.split('.');
            if (splitType.length > 1) {
              properties.type = splitType[0];
              properties.format = splitType[1];
            }
          } else {
            properties.schema = schema;
          }
          params.push(properties);
        }

        if (title === 'operationId' && route) {
          parameterRef[route.method].operationId = commentTags[j].description;
        }

        if (title === 'summary' && route) {
          parameterRef[route.method].summary = formatterDescriptions(commentTags[j].description);
        }

        if (title === 'produces' && route) {
          parameterRef[route.method].produces = parseProduces(commentTags[j].description);
        }

        if (title === 'consumes' && route) {
          parameterRef[route.method].consumes = parseConsumes(commentTags[j].description);
        }

        if (title === 'security' && route) {
          parameterRef[route.method].security = parseSecurity(commentTags[j].description);
        }

        if (route) {
          parameterRef[route.method].parameters = params;
          parameterRef[route.method].responses = parseReturn(commentTags);
        }
      }
    }
  }
  return {
    parameters,
    tags,
    definitions,
  };
}

/**
 * Filters JSDoc comments
 * @function
 * @param {object} jsDocComments - JSDoc comments
 * @returns {object} JSDoc comments
 * @requires js-yaml
 */
function filterJsDocComments(jsDocComments) {
  return jsDocComments.filter(item => item.tags.length > 0);
}

/**
 * Converts an array of globs to full paths
 * @function
 * @param {string} base - Base path
 * @param {array} globs - Array of globs and/or normal paths
 * @return {array} Array of fully-qualified paths
 * @requires glob
 */
function convertGlobPaths(base, globs) {
  return globs.reduce((acc, globString) => {
    const globFiles = glob.sync(path.resolve(base, globString));
    return acc.concat(globFiles);
  }, []);
}

/**
 * Set to express application (app) the api-docs routes
 * @param {object} options - Configuration options
 * @returns {Promise<object>} Swagger spec
 */
module.exports = function (options) {
  /* istanbul ignore if */
  if (!options) {
    throw new Error('\'options\' is required.');
  } else {
    /* istanbul ignore if */
    if (!options.swaggerDefinition) {
      throw new Error('\'swaggerDefinition\' is required.');
    } else {
      /* istanbul ignore if */
      if (!options.files) {
        throw new Error('\'files\' is required.');
      }
    }
  }

  formatterDescriptions = options.formatterDescriptions || formatterDescriptions;

  // Build basic swagger json
  let swaggerObject = swaggerHelpers.swaggerizeObj(options.swaggerDefinition);
  const apiFiles = convertGlobPaths(options.basedir, options.files);

  // Parse the documentation in the APIs array.
  for (let i = 0; i < apiFiles.length; i += 1) {
    const parsedFile = parseApiFile(apiFiles[i]);
    // console.log(JSON.stringify(parsedFile))
    const comments = filterJsDocComments(parsedFile);

    for (const j in comments) {
      const parsed = fileFormat(comments[j]);
      swaggerHelpers.addDataToSwaggerObject(swaggerObject, [{
        paths: parsed.parameters,
        tags: parsed.tags,
        definitions: parsed.definitions,
      }]);
    }
  }

  return new Promise((resolve, reject) => {
    parser.parse(swaggerObject, (err, api) => {
      if (!err) {
        swaggerObject = api;
        api.tags = api.tags.sort((a, b) => a.name.localeCompare(b.name));
        resolve(swaggerObject);
      } else {
        reject(err);
      }
    });
  });
};
