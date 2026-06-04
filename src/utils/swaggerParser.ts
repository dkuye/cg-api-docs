export interface SchemaField {
  name: string;
  type: string;
  description: string;
  required: boolean;
  ref?: string;
  properties?: SchemaField[];
  items?: SchemaField;
}

/**
 * Resolves a ref string like "#/definitions/User" to the actual definition object.
 */
export function resolveRef(ref: string, definitions: any): any {
  if (!ref || !definitions) return null;
  const parts = ref.replace(/^#\//, '').split('/');
  let current = { definitions };
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as any)[part];
    } else {
      return null;
    }
  }
  return current;
}

/**
 * Recursively generates a mock object/value based on a Swagger schema.
 * Prevents infinite recursion by tracking visited definitions.
 */
export function generateMockFromSchema(
  schema: any,
  definitions: any,
  visited = new Set<string>()
): any {
  if (!schema) return null;

  // Resolve reference if present
  if (schema.$ref) {
    const refKey = schema.$ref;
    if (visited.has(refKey)) {
      return { _circular: `Circular reference to ${refKey.split('/').pop()}` };
    }
    const resolved = resolveRef(refKey, definitions);
    if (!resolved) return null;

    const newVisited = new Set(visited);
    newVisited.add(refKey);
    return generateMockFromSchema(resolved, definitions, newVisited);
  }

  // Handle allOf / anyOf / oneOf
  if (schema.allOf && Array.isArray(schema.allOf)) {
    let combined: any = {};
    for (const sub of schema.allOf) {
      const mock = generateMockFromSchema(sub, definitions, visited);
      if (mock && typeof mock === 'object') {
        combined = { ...combined, ...mock };
      }
    }
    return combined;
  }

  const type = schema.type;

  if (type === 'object' || schema.properties) {
    const mockObj: any = {};
    const props = schema.properties || {};
    for (const key of Object.keys(props)) {
      mockObj[key] = generateMockFromSchema(props[key], definitions, visited);
    }
    return mockObj;
  }

  if (type === 'array' || schema.items) {
    const itemSchema = schema.items || {};
    // Generate a single item in the array for demonstration
    const mockItem = generateMockFromSchema(itemSchema, definitions, visited);
    return mockItem !== null ? [mockItem] : [];
  }

  // Primitive types
  if (type === 'string') {
    // Basic smart heuristics for mock values
    const nameLower = (schema.description || '').toLowerCase();
    if (nameLower.includes('email')) return 'user@example.com';
    if (nameLower.includes('uuid')) return '123e4567-e89b-12d3-a456-426614174000';
    if (nameLower.includes('token') || nameLower.includes('jwt')) return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
    if (nameLower.includes('phone') || nameLower.includes('sms')) return '+15551234567';
    if (nameLower.includes('password')) return 'password123';
    return '';
  }

  if (type === 'integer' || type === 'number') {
    return 0;
  }

  if (type === 'boolean') {
    return false;
  }

  // Default fallback
  return null;
}

/**
 * Recursively parses a schema to build a tree of SchemaFields for visualization.
 * Prevents infinite loops.
 */
export function resolveSchemaToTree(
  schema: any,
  definitions: any,
  fieldName = '',
  isRequired = false,
  visited = new Set<string>()
): SchemaField {
  if (!schema) {
    return { name: fieldName, type: 'any', description: '', required: isRequired };
  }

  // Resolve references
  if (schema.$ref) {
    const refKey = schema.$ref;
    const refName = refKey.split('/').pop() || 'Object';
    
    if (visited.has(refKey)) {
      return {
        name: fieldName,
        type: `Circular Ref: ${refName}`,
        description: 'Circular reference detected.',
        required: isRequired
      };
    }
    
    const resolved = resolveRef(refKey, definitions);
    if (!resolved) {
      return {
        name: fieldName,
        type: `Ref: ${refName} (Unresolved)`,
        description: `Could not resolve definition ${refKey}`,
        required: isRequired
      };
    }

    const newVisited = new Set(visited);
    newVisited.add(refKey);

    const resolvedTree = resolveSchemaToTree(resolved, definitions, fieldName, isRequired, newVisited);
    // Overwrite the type label to indicate it came from a resolved definition
    resolvedTree.ref = refName;
    return resolvedTree;
  }

  // Handle allOf
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const properties: SchemaField[] = [];
    let desc = schema.description || 'Combined properties:';
    
    for (const sub of schema.allOf) {
      const subTree = resolveSchemaToTree(sub, definitions, '', false, visited);
      if (subTree.properties) {
        properties.push(...subTree.properties);
      }
      if (subTree.description) {
        desc += ` ${subTree.description}`;
      }
    }
    
    return {
      name: fieldName,
      type: 'object',
      description: desc,
      required: isRequired,
      properties
    };
  }

  const type = schema.type || 'object';
  const desc = schema.description || '';

  if (type === 'object' || schema.properties) {
    const props = schema.properties || {};
    const requiredProps = Array.isArray(schema.required) ? schema.required : [];
    
    const properties = Object.keys(props).map(key => {
      const isPropRequired = requiredProps.includes(key);
      return resolveSchemaToTree(props[key], definitions, key, isPropRequired, visited);
    });

    return {
      name: fieldName,
      type: 'object',
      description: desc,
      required: isRequired,
      properties
    };
  }

  if (type === 'array' || schema.items) {
    const itemsSchema = schema.items || {};
    const itemsTree = resolveSchemaToTree(itemsSchema, definitions, 'item', false, visited);
    
    return {
      name: fieldName,
      type: 'array',
      description: desc,
      required: isRequired,
      items: itemsTree
    };
  }

  // Simple base types
  return {
    name: fieldName,
    type: type,
    description: desc,
    required: isRequired
  };
}
