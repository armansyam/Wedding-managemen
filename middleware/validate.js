// Input validation utilities for Wedding-MAnagement website
const passwordUtils = require('./auth').passwordUtils;

// Validation schemas for different data types
const validationSchemas = {
  // User input for inquiries
  inquiry: {
    fields: {
      name: { required: true, minLength: 2, maxLength: 100 },
      email: { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
      phone: { required: true, pattern: /^\d{10,15}$/ },
      event_type: { required: true, enum: ['Wedding 💍', 'Engagement 💕', 'Prewedding 📸'] },
      event_date: { required: true },
      budget: { min: 1000000, max: 100000000 },
      needs: { required: true, minItems: 1 }
    }
  },

  // Login authentication
  login: {
    fields: {
      username: { required: true, maxLength: 50 },
      password: { required: true, minLength: 8 }
    }
  },

  // Admin user creation
  adminCreate: {
    fields: {
      username: { required: true, maxLength: 50 },
      password: { required: true, minLength: 8 },
      email: { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
    }
  },

  // Booking data
  booking: {
    fields: {
      client_id: { required: true },
      package_id: { required: true },
      booking_date: { required: true },
      total_amount: { min: 0 },
      payment_status: { enum: ['pending', 'partial', 'paid', 'cancelled'] }
    }
  },

  // Content management (packages, products, etc.)
  content: {
    fields: {
      title: { required: true, maxLength: 200 },
      description: { maxLength: 5000 },
      price: { min: 0 },
      status: { enum: ['draft', 'published', 'archived'] }
    }
  }
};

// Generic validation function
const validateInput = (data, schema, options = {}) => {
  const { strip = false, sanitize = true } = options;
  const errors = [];

  for (const [field, rules] of Object.entries(schema.fields)) {
    const value = data[field];

    // Check required fields
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`Field "${field}" is required`);
      continue;
    }

    // Skip validation if field is empty and not required
    if (value === undefined || value === null || value === '') {
      continue;
    }

    // Apply sanitization if enabled
    let sanitizedValue = value;
    if (sanitize) {
      sanitizedValue = sanitizeValue(value, field, rules);
    }

    // Validate length constraints
    if (rules.minLength && sanitizedValue.toString().length < rules.minLength) {
      errors.push(`Field "${field}" must be at least ${rules.minLength} characters long`);
    }

    if (rules.maxLength && sanitizedValue.toString().length > rules.maxLength) {
      errors.push(`Field "${field}" must not exceed ${rules.maxLength} characters`);
    }

    // Validate pattern matching
    if (rules.pattern && !rules.pattern.test(sanitizedValue.toString())) {
      errors.push(`Field "${field}" has an invalid format`);
    }

    // Validate enum values
    if (rules.enum && !rules.enum.includes(sanitizedValue)) {
      errors.push(`Field "${field}" has an invalid value. Allowed: ${rules.enum.join(', ')}`);
    }

    // Validate numeric ranges
    if (rules.min !== undefined && Number(sanitizedValue) < rules.min) {
      errors.push(`Field "${field}" must be at least ${rules.min}`);
    }

    if (rules.max !== undefined && Number(sanitizedValue) > rules.max) {
      errors.push(`Field "${field}" must not exceed ${rules.max}`);
    }

    // Validate array constraints
    if (Array.isArray(rules.enum) && sanitizedValue.length < rules.minItems) {
      errors.push(`Please select at least ${rules.minItems} options for "${field}"`);
    }

    // Password strength validation
    if (field.toLowerCase().includes('password') && rules.minLength) {
      const passwordValidation = passwordUtils.validatePassword(sanitizedValue);
      if (!passwordValidation.valid) {
        errors.push(`Password validation failed: ${passwordValidation.error}`);
      }
    }
  }

  if (strip && !options.keepFields) {
    for (const field of Object.keys(schema.fields)) {
      if (!(field in data)) {
        delete data[field];
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedData: sanitize ? sanitizeObject(data, schema) : data
  };
};

// Sanitization functions
const sanitizeValue = (value, field, rules) => {
  const strValue = String(value);

  // Remove potential XSS content
  let sanitized = strValue
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');

  // Trim whitespace for text fields
  if (typeof rules === 'object' && (rules.minLength || rules.maxLength)) {
    sanitized = sanitized.trim();
  }

  // Sanitize email addresses
  if (field.toLowerCase() === 'email') {
    sanitized = sanitized.toLowerCase().replace(/\s/g, '');
  }

  // Sanitize phone numbers
  if (field.toLowerCase() === 'phone') {
    sanitized = sanitized.replace(/[^0-9+]/g, '');
  }

  return sanitized;
};

const sanitizeObject = (obj, schema) => {
  const sanitized = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) {
      sanitized[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === 'object' ? sanitizeObject(item, schema) : sanitizeValue(item, key, schema.fields[key] || {})
      );
    } else if (typeof value === 'object' && !(value instanceof Date)) {
      sanitized[key] = sanitizeObject(value, schema);
    } else {
      sanitized[key] = sanitizeValue(value, key, schema.fields[key] || {});
    }
  }

  return sanitized;
};

const validationMiddleware = (schemaName, fieldMapping = {}) => {
  return (req, res, next) => {
    try {
      const schema = validationSchemas[schemaName];
      if (!schema) {
        return res.status(400).json({ error: 'Invalid validation schema' });
      }

      // Apply field mapping if provided
      const dataToValidate = {};
      for (const [formField, schemaField] of Object.entries(fieldMapping)) {
        if (req.body[formField] !== undefined) {
          dataToValidate[schemaField || formField] = req.body[formField];
        }
      }

      // Add remaining body fields
      for (const [key, value] of Object.entries(req.body)) {
        if (!(key in fieldMapping)) {
          dataToValidate[key] = value;
        }
      }

      const validation = validateInput(dataToValidate, schema, {
        strip: true,
        sanitize: true
      });

      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.errors,
          field: validation.errors[0].includes('Field "') ? 
            validation.errors[0].split('"')[1] : null
        });
      }

      // Update request body with sanitized data
      req.body = validation.sanitizedData;

      next();
    } catch (error) {
      console.error('Validation error:', error);
      res.status(500).json({ error: 'Validation processing error' });
    }
  };
};

module.exports = {
  validationSchemas,
  validateInput,
  validationMiddleware
};