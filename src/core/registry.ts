/**
 * Block Registry - Central catalog for all node types in the visual programming environment
 * Provides strict type safety, runtime validation, and immutable block definitions
 */

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export type Category = "data" | "control" | "math" | "io" | "logic";

export interface BlockMetadata {
  readonly displayName: string;
  readonly category: Category;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly isCircular?: boolean;
  readonly defaultProps?: Record<string, unknown>;
  readonly color?: string;
  readonly icon?: string;
  readonly description?: string;
  readonly version?: string;
  readonly author?: string;
}

export interface ExecutionContext {
  readonly elementId: string;
  readonly inputs: Record<string, unknown>;
  readonly state: Map<string, Map<string, unknown>>;
  readonly connections: Map<string, string[]>;

  /**
   * Dispatch execution to all edges labeled with the specified output
   * @param output - The output port name
   * @param value - The value to pass through the connection
   */
  go(output: string, value?: unknown): Promise<void>;

  /**
   * Write to this node's local state store
   * @param key - State key
   * @param value - State value
   */
  setValue(key: string, value: unknown): void;

  /**
   * Read from this node's local state store
   * @param key - State key
   * @returns The stored value or undefined
   */
  getValue(key: string): unknown;

  /**
   * Append message to the execution log
   * @param message - Log message
   */
  log(message: string): void;
}

export interface RenderResult {
  readonly label: string;
  readonly content: string;
  readonly value?: string;
}

export interface BlockDefinition extends BlockMetadata {
  /**
   * Async business logic - may call `await ctx.go()`
   * @param ctx - Execution context
   */
  readonly execute?: (ctx: ExecutionContext) => Promise<void>;

  /**
   * Optional props validator
   * @param props - Block properties to validate
   * @returns Error message string if invalid, null if valid
   */
  readonly validate?: (props: Record<string, unknown>) => string | null;

  /**
   * Runtime-agnostic visual description
   * @param props - Block properties
   * @returns Render information for the block
   */
  readonly render?: (props: Record<string, unknown>) => RenderResult;
}

function isDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }

  if (typeof a !== typeof b) return false;

  if (typeof a === "object") {
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!isDeepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      if (!bKeys.includes(key)) return false;
      if (!isDeepEqual(aObj[key], bObj[key])) return false;
    }

    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Validation Functions
// ---------------------------------------------------------------------------

/**
 * Validates block type string
 */
function validateBlockType(type: unknown): asserts type is string {
  if (typeof type !== "string") {
    throw new TypeError("Block type must be a string");
  }
  if (type.trim() === "") {
    throw new TypeError("Block type cannot be empty");
  }
  if (type.length > 50) {
    throw new TypeError("Block type too long (max 50 characters)");
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(type)) {
    throw new TypeError(
      "Block type must start with letter and contain only alphanumeric, underscore, or dash characters"
    );
  }
}

/**
 * Validates block definition structure
 */
function validateBlockDefinition(
  definition: unknown
): asserts definition is BlockDefinition {
  if (!definition || typeof definition !== "object") {
    throw new TypeError("Block definition must be a non-null object");
  }

  const def = definition as Record<string, unknown>;

  // Validate displayName
  if (typeof def.displayName !== "string" || def.displayName.trim() === "") {
    throw new TypeError("displayName must be a non-empty string");
  }
  if (def.displayName.length > 100) {
    throw new TypeError("displayName too long (max 100 characters)");
  }

  // Validate category
  const validCategories: readonly Category[] = [
    "data",
    "control",
    "math",
    "io",
    "logic",
  ];
  if (!validCategories.includes(def.category as Category)) {
    throw new TypeError(
      `category must be one of: ${validCategories.join(", ")}`
    );
  }

  // Validate inputs array
  if (!Array.isArray(def.inputs)) {
    throw new TypeError("inputs must be an array");
  }
  if (def.inputs.length > 20) {
    throw new TypeError("Too many inputs (max 20)");
  }
  for (const input of def.inputs) {
    if (typeof input !== "string" || input.trim() === "") {
      throw new TypeError("All inputs must be non-empty strings");
    }
    if (input.length > 50) {
      throw new TypeError("Input name too long (max 50 characters)");
    }
  }

  // Validate outputs array
  if (!Array.isArray(def.outputs)) {
    throw new TypeError("outputs must be an array");
  }
  if (def.outputs.length > 20) {
    throw new TypeError("Too many outputs (max 20)");
  }
  for (const output of def.outputs) {
    if (typeof output !== "string" || output.trim() === "") {
      throw new TypeError("All outputs must be non-empty strings");
    }
    if (output.length > 50) {
      throw new TypeError("Output name too long (max 50 characters)");
    }
  }

  // Validate optional fields
  if (def.isCircular !== undefined && typeof def.isCircular !== "boolean") {
    throw new TypeError("isCircular must be a boolean if provided");
  }

  if (def.defaultProps !== undefined) {
    if (
      !def.defaultProps ||
      typeof def.defaultProps !== "object" ||
      Array.isArray(def.defaultProps)
    ) {
      throw new TypeError("defaultProps must be a plain object if provided");
    }
  }

  if (def.color !== undefined) {
    if (typeof def.color !== "string") {
      throw new TypeError("color must be a string if provided");
    }
    if (def.color.length > 20) {
      throw new TypeError("color string too long (max 20 characters)");
    }
  }

  if (def.icon !== undefined) {
    if (typeof def.icon !== "string") {
      throw new TypeError("icon must be a string if provided");
    }
    if (def.icon.length > 10) {
      throw new TypeError("icon string too long (max 10 characters)");
    }
  }

  if (def.description !== undefined) {
    if (typeof def.description !== "string") {
      throw new TypeError("description must be a string if provided");
    }
    if (def.description.length > 500) {
      throw new TypeError("description too long (max 500 characters)");
    }
  }

  if (def.version !== undefined) {
    if (typeof def.version !== "string") {
      throw new TypeError("version must be a string if provided");
    }
    if (def.version.length > 20) {
      throw new TypeError("version string too long (max 20 characters)");
    }
  }

  if (def.author !== undefined) {
    if (typeof def.author !== "string") {
      throw new TypeError("author must be a string if provided");
    }
    if (def.author.length > 100) {
      throw new TypeError("author string too long (max 100 characters)");
    }
  }

  // Validate function types
  if (def.execute !== undefined && typeof def.execute !== "function") {
    throw new TypeError("execute must be a function if provided");
  }

  if (def.validate !== undefined && typeof def.validate !== "function") {
    throw new TypeError("validate must be a function if provided");
  }

  if (def.render !== undefined && typeof def.render !== "function") {
    throw new TypeError("render must be a function if provided");
  }
}

/**
 * Creates a safe, deep copy of an object with size limits
 */
function createSafeCopy(obj: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof key !== "string" || key.length > 100) {
      continue; // Skip invalid keys
    }

    if (value === null || value === undefined) {
      copy[key] = value;
    } else if (typeof value === "string") {
      copy[key] = value.length > 10000 ? value.slice(0, 10000) : value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      copy[key] = value;
    } else if (Array.isArray(value)) {
      copy[key] = value.slice(0, 1000); // Limit array size
    } else if (typeof value === "object") {
      // Simple object copy with depth limit
      copy[key] = JSON.parse(JSON.stringify(value));
    }
  }

  return copy;
}

// ---------------------------------------------------------------------------
// Block Registry Implementation
// ---------------------------------------------------------------------------

/**
 * BlockRegistryImpl provides centralized management of block types
 * with comprehensive validation and type safety
 */
class BlockRegistryImpl {
  private readonly blocks = new Map<string, Readonly<BlockDefinition>>();
  private readonly registrationHistory = new Map<string, number>();
  private registrationCount = 0;

  /**
   * Register a new block type with comprehensive validation
   * @param type - Unique block type identifier
   * @param definition - Block definition object
   * @throws {TypeError} If type or definition is invalid
   * @throws {Error} If block type already exists with different definition
   */
  public register(type: string, definition: BlockDefinition): void {
    validateBlockType(type);
    validateBlockDefinition(definition);

    // Check for existing registration
    const existing = this.blocks.get(type);
    if (existing) {
      // Allow re-registration only if definitions are identical
      if (!this.areDefinitionsEqual(existing, definition)) {
        throw new Error(
          `Block type "${type}" already registered with different definition. ` +
            "Use unregister() first to replace, or choose a different type name."
        );
      }
      return; // Identical definition, no need to re-register
    }

    // Validate inputs/outputs uniqueness within block
    const inputSet = new Set(definition.inputs);
    if (inputSet.size !== definition.inputs.length) {
      throw new Error(`Block type "${type}" has duplicate input names`);
    }

    const outputSet = new Set(definition.outputs);
    if (outputSet.size !== definition.outputs.length) {
      throw new Error(`Block type "${type}" has duplicate output names`);
    }

    // Check for input/output name conflicts
    const nameConflicts = definition.inputs.filter((input) =>
      definition.outputs.includes(input)
    );
    if (nameConflicts.length > 0) {
      throw new Error(
        `Block type "${type}" has conflicting input/output names: ${nameConflicts.join(
          ", "
        )}`
      );
    }

    // Create immutable definition with defaults
    const safeDefinition: BlockDefinition = {
      ...definition,
      inputs: Object.freeze([...definition.inputs]),
      outputs: Object.freeze([...definition.outputs]),
      defaultProps: definition.defaultProps
        ? Object.freeze(createSafeCopy(definition.defaultProps))
        : Object.freeze({}),
      render:
        definition.render ??
        this.createDefaultRender(definition.displayName, type),
      version: definition.version ?? "1.0.0",
      description: definition.description ?? `${definition.displayName} block`,
    };

    // Test the render function if provided
    if (safeDefinition.render) {
      try {
        const testProps = safeDefinition.defaultProps ?? {};
        const renderResult = safeDefinition.render(testProps);
        this.validateRenderResult(renderResult, type);
      } catch (error) {
        throw new Error(
          `Render function test failed for block type "${type}": ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Test the validate function if provided
    if (safeDefinition.validate) {
      try {
        const testProps = safeDefinition.defaultProps ?? {};
        const validationResult = safeDefinition.validate(testProps);
        if (validationResult !== null && typeof validationResult !== "string") {
          throw new Error("Validate function must return string or null");
        }
      } catch (error) {
        throw new Error(
          `Validate function test failed for block type "${type}": ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Store immutable definition
    this.blocks.set(type, Object.freeze(safeDefinition));
    this.registrationHistory.set(type, ++this.registrationCount);

    // Prevent further modification of the definition object
    if (typeof Object.freeze === "function") {
      Object.freeze(safeDefinition);
    }
  }

  /**
   * Retrieve a block definition by type
   * @param type - Block type identifier
   * @returns Block definition or undefined if not found
   * @throws {TypeError} If type is not a string
   */
  public get(type: string): Readonly<BlockDefinition> | undefined {
    if (typeof type !== "string") {
      throw new TypeError("Block type must be a string");
    }
    return this.blocks.get(type);
  }

  /**
   * Check if a block type is registered
   * @param type - Block type identifier
   * @returns True if block type exists
   * @throws {TypeError} If type is not a string
   */
  public has(type: string): boolean {
    if (typeof type !== "string") {
      throw new TypeError("Block type must be a string");
    }
    return this.blocks.has(type);
  }

  /**
   * Get all registered block type names
   * @returns Array of block type strings
   */
  public getTypes(): readonly string[] {
    return Object.freeze([...this.blocks.keys()]);
  }

  /**
   * Get blocks filtered by category
   * @param category - Category to filter by
   * @returns Array of blocks in the specified category
   * @throws {TypeError} If category is invalid
   */
  public getByCategory(
    category: Category
  ): ReadonlyArray<Readonly<{ type: string; definition: BlockDefinition }>> {
    const validCategories: readonly Category[] = [
      "data",
      "control",
      "math",
      "io",
      "logic",
    ];
    if (!validCategories.includes(category)) {
      throw new TypeError(
        `Invalid category. Must be one of: ${validCategories.join(", ")}`
      );
    }

    return Object.freeze(
      [...this.blocks.entries()]
        .filter(([, definition]) => definition.category === category)
        .map(([type, definition]) => Object.freeze({ type, definition }))
    );
  }

  /**
   * Get all registered blocks
   * @returns Array of all block type/definition pairs
   */
  public getAll(): ReadonlyArray<
    Readonly<{ type: string; definition: BlockDefinition }>
  > {
    return Object.freeze(
      [...this.blocks.entries()].map(([type, definition]) =>
        Object.freeze({ type, definition })
      )
    );
  }

  /**
   * Get registry statistics
   * @returns Statistics about registered blocks
   */
  public getStats(): Readonly<{
    totalBlocks: number;
    categoryCounts: Record<Category, number>;
    averageInputs: number;
    averageOutputs: number;
  }> {
    const stats = {
      totalBlocks: this.blocks.size,
      categoryCounts: {
        data: 0,
        control: 0,
        math: 0,
        io: 0,
        logic: 0,
      } as Record<Category, number>,
      averageInputs: 0,
      averageOutputs: 0,
    };

    let totalInputs = 0;
    let totalOutputs = 0;

    for (const definition of this.blocks.values()) {
      stats.categoryCounts[definition.category]++;
      totalInputs += definition.inputs.length;
      totalOutputs += definition.outputs.length;
    }

    if (this.blocks.size > 0) {
      stats.averageInputs =
        Math.round((totalInputs / this.blocks.size) * 100) / 100;
      stats.averageOutputs =
        Math.round((totalOutputs / this.blocks.size) * 100) / 100;
    }

    return Object.freeze(stats);
  }

  /**
   * Clear all registered blocks
   * @param confirm - Must be true to confirm the operation
   * @throws {Error} If confirm is not true
   */
  public clear(confirm = false): void {
    if (confirm !== true) {
      throw new Error(
        "Must explicitly confirm clear operation by passing true"
      );
    }
    this.blocks.clear();
    this.registrationHistory.clear();
    this.registrationCount = 0;
  }

  /**
   * Unregister a specific block type
   * @param type - Block type to unregister
   * @returns True if block was removed, false if it didn't exist
   * @throws {TypeError} If type is not a string
   */
  public unregister(type: string): boolean {
    if (typeof type !== "string") {
      throw new TypeError("Block type must be a string");
    }

    const wasDeleted = this.blocks.delete(type);
    if (wasDeleted) {
      this.registrationHistory.delete(type);
    }
    return wasDeleted;
  }

  /**
   * Validate that a block definition can be executed
   * @param type - Block type to validate
   * @param props - Properties to validate with
   * @returns Validation result with any errors
   */
  public validateBlock(
    type: string,
    props: Record<string, unknown>
  ): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const result = {
      isValid: true,
      errors: [] as string[],
      warnings: [] as string[],
    };

    try {
      const definition = this.get(type);
      if (!definition) {
        result.errors.push(`Block type "${type}" is not registered`);
        result.isValid = false;
        return result;
      }

      // Validate props against definition
      if (definition.validate) {
        const validationError = definition.validate(props);
        if (validationError) {
          result.errors.push(validationError);
          result.isValid = false;
        }
      }

      // Check for missing required props
      if (definition.defaultProps) {
        for (const key of Object.keys(definition.defaultProps)) {
          if (!(key in props)) {
            result.warnings.push(`Missing optional property: ${key}`);
          }
        }
      }

      // Validate prop types are reasonable
      for (const [key, value] of Object.entries(props)) {
        if (typeof key !== "string" || key.length > 100) {
          result.errors.push(`Invalid property key: ${key}`);
          result.isValid = false;
        }

        if (typeof value === "string" && value.length > 100000) {
          result.warnings.push(`Property ${key} has very large string value`);
        }

        if (Array.isArray(value) && value.length > 10000) {
          result.warnings.push(`Property ${key} has very large array`);
        }
      }
    } catch (error) {
      result.errors.push(
        `Validation error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      result.isValid = false;
    }

    return result;
  }

  /**
   * Create default render function for blocks without custom rendering
   */
  private createDefaultRender(displayName: string, type: string) {
    return (): RenderResult => ({
      label: displayName,
      content: type.charAt(0).toUpperCase() + type.slice(1),
    });
  }

  /**
   * Validate render function result
   */
  private validateRenderResult(result: unknown, blockType: string): void {
    if (!result || typeof result !== "object") {
      throw new Error("Render function must return an object");
    }

    const renderResult = result as Record<string, unknown>;

    if (typeof renderResult.label !== "string") {
      throw new Error("Render result must have string label property");
    }

    if (typeof renderResult.content !== "string") {
      throw new Error("Render result must have string content property");
    }

    if (
      renderResult.value !== undefined &&
      typeof renderResult.value !== "string"
    ) {
      throw new Error(
        "Render result value property must be string if provided"
      );
    }

    if (renderResult.label.length > 100) {
      throw new Error("Render result label too long (max 100 characters)");
    }

    if (renderResult.content.length > 1000) {
      throw new Error("Render result content too long (max 1000 characters)");
    }
  }

  /**
   * Compare two block definitions for equality
   */
  private areDefinitionsEqual(
    def1: BlockDefinition,
    def2: BlockDefinition
  ): boolean {
    try {
      // Compare basic properties
      if (
        def1.displayName !== def2.displayName ||
        def1.category !== def2.category ||
        def1.isCircular !== def2.isCircular ||
        def1.color !== def2.color ||
        def1.icon !== def2.icon ||
        def1.description !== def2.description ||
        def1.version !== def2.version ||
        def1.author !== def2.author
      ) {
        return false;
      }

      // Compare arrays
      if (
        !isDeepEqual(def1.inputs, def2.inputs) ||
        !isDeepEqual(def1.outputs, def2.outputs)
      ) {
        return false;
      }

      if (!isDeepEqual(def1.defaultProps, def2.defaultProps)) {
        return false;
      }

      // Compare function signatures (we can't compare function content)
      if (
        (def1.execute === undefined) !== (def2.execute === undefined) ||
        (def1.validate === undefined) !== (def2.validate === undefined) ||
        (def1.render === undefined) !== (def2.render === undefined)
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton Export and Global Registration
// ---------------------------------------------------------------------------

/**
 * Global block registry instance
 * Provides centralized management of all block types
 */
export const BlockRegistry = new BlockRegistryImpl();

// Make registry available in browser console for debugging
if (typeof window !== "undefined") {
  // @ts-ignore - Augment window object for development
  window.BlockRegistry = BlockRegistry;
}

// Prevent external modification of the registry class
if (typeof Object.freeze === "function") {
  Object.freeze(BlockRegistryImpl);
  Object.freeze(BlockRegistryImpl.prototype);
}

// ---------------------------------------------------------------------------
// Built-in Block Definitions
// ---------------------------------------------------------------------------

/**
 * Register all block types including core and assignment operations
 */
function registerAllBlocks(): void {
  try {
    // Core Data blocks
    BlockRegistry.register("variable", {
      displayName: "Variable",
      category: "data",
      inputs: [],
      outputs: ["value"],
      defaultProps: { name: "var", value: 0 },
      description: "Stores a single value",
      execute: async (ctx) => {
        const value = ctx.inputs.value ?? ctx.inputs.name ?? "undefined";
        ctx.setValue("value", value);
        ctx.log(`Variable value: ${value}`);
        await ctx.go("value", value);
      },
      render: (props) => ({
        label: "VAR",
        content: String(props.name || "variable"),
        value: String(props.value ?? ""),
      }),
    });

    // Assignment Operations
    BlockRegistry.register("set_variable", {
      displayName: "Set Variable",
      category: "data",
      inputs: ["target", "value"],
      outputs: ["result"],
      defaultProps: { name: "myVar" },
      description: "Assigns a value to a variable",
      execute: async (ctx) => {
        const name = ctx.inputs.name || ctx.inputs.target || "variable";
        const value = ctx.inputs.value ?? null;
        
        // Store in global state for access by other blocks
        const globalState = ctx.state.get("__global__") || new Map();
        if (!ctx.state.has("__global__")) {
          ctx.state.set("__global__", globalState);
        }
        
        globalState.set(String(name), value);
        ctx.setValue("result", value);
        ctx.log(`Set ${name} = ${JSON.stringify(value)}`);
        
        await ctx.go("result", value);
      },
      render: (props) => ({
        label: "SET",
        content: `${props.name || "var"} = ?`,
      }),
    });

    BlockRegistry.register("get_variable", {
      displayName: "Get Variable",
      category: "data",
      inputs: [],
      outputs: ["value"],
      defaultProps: { name: "myVar" },
      description: "Gets the current value of a variable",
      execute: async (ctx) => {
        const name = ctx.inputs.name || "variable";
        const globalState = ctx.state.get("__global__");
        const value = globalState?.get(String(name)) ?? null;
        
        ctx.setValue("value", value);
        ctx.log(`Get ${name} = ${JSON.stringify(value)}`);
        
        await ctx.go("value", value);
      },
      render: (props) => ({
        label: "GET",
        content: String(props.name || "var"),
      }),
    });

    BlockRegistry.register("array", {
      displayName: "Array",
      category: "data",
      inputs: [],
      outputs: ["items"],
      defaultProps: { items: [1, 2, 3] },
      description: "Stores an array of values",
      execute: async (ctx) => {
        const items = ctx.inputs.items ?? [1, 2, 3];
        ctx.setValue("items", items);
        ctx.log(`Array with ${Array.isArray(items) ? items.length : 0} items`);
        await ctx.go("items", items);
      },
      render: (props) => ({
        label: "ARRAY",
        content: `[${Array.isArray(props.items) ? props.items.length : 0}]`,
      }),
    });

    // Array Operations
    BlockRegistry.register("array_push", {
      displayName: "Array Push",
      category: "data",
      inputs: ["array", "item"],
      outputs: ["result"],
      defaultProps: {},
      description: "Adds an item to the end of an array",
      execute: async (ctx) => {
        const inputArray = ctx.inputs.array;
        const item = ctx.inputs.item;
        
        let resultArray: unknown[];
        if (Array.isArray(inputArray)) {
          resultArray = [...inputArray, item];
        } else {
          resultArray = [item];
        }
        
        ctx.setValue("result", resultArray);
        ctx.log(`Pushed ${JSON.stringify(item)} to array (length: ${resultArray.length})`);
        
        await ctx.go("result", resultArray);
      },
      render: () => ({
        label: "PUSH",
        content: "array.push(item)",
      }),
    });

    BlockRegistry.register("array_pop", {
      displayName: "Array Pop",
      category: "data",
      inputs: ["array"],
      outputs: ["array", "item"],
      defaultProps: {},
      description: "Removes and returns the last item from an array",
      execute: async (ctx) => {
        const inputArray = ctx.inputs.array;
        
        if (!Array.isArray(inputArray) || inputArray.length === 0) {
          ctx.log("Cannot pop from empty or non-array");
          await ctx.go("array", inputArray);
          await ctx.go("item", null);
          return;
        }
        
        const resultArray = [...inputArray];
        const poppedItem = resultArray.pop();
        
        ctx.setValue("array", resultArray);
        ctx.setValue("item", poppedItem);
        ctx.log(`Popped ${JSON.stringify(poppedItem)} from array`);
        
        await ctx.go("array", resultArray);
        await ctx.go("item", poppedItem);
      },
      render: () => ({
        label: "POP",
        content: "array.pop()",
      }),
    });

    BlockRegistry.register("array_get", {
      displayName: "Array Get",
      category: "data",
      inputs: ["array", "index"],
      outputs: ["value"],
      defaultProps: { index: 0 },
      description: "Gets an item from an array by index",
      execute: async (ctx) => {
        const inputArray = ctx.inputs.array;
        const index = Number(ctx.inputs.index ?? 0);
        
        let value = null;
        if (Array.isArray(inputArray) && index >= 0 && index < inputArray.length) {
          value = inputArray[index];
        }
        
        ctx.setValue("value", value);
        ctx.log(`Get array[${index}] = ${JSON.stringify(value)}`);
        
        await ctx.go("value", value);
      },
      render: (props) => ({
        label: "GET",
        content: `array[${props.index ?? 0}]`,
      }),
    });

    BlockRegistry.register("array_set", {
      displayName: "Array Set",
      category: "data",
      inputs: ["array", "index", "value"],
      outputs: ["result"],
      defaultProps: { index: 0 },
      description: "Sets an item in an array by index",
      execute: async (ctx) => {
        const inputArray = ctx.inputs.array;
        const index = Number(ctx.inputs.index ?? 0);
        const value = ctx.inputs.value;
        
        let resultArray: unknown[];
        if (Array.isArray(inputArray)) {
          resultArray = [...inputArray];
          if (index >= 0) {
            // Extend array if necessary
            while (resultArray.length <= index) {
              resultArray.push(null);
            }
            resultArray[index] = value;
          }
        } else {
          // Create new array if input wasn't an array
          resultArray = [];
          if (index >= 0) {
            while (resultArray.length <= index) {
              resultArray.push(null);
            }
            resultArray[index] = value;
          }
        }
        
        ctx.setValue("result", resultArray);
        ctx.log(`Set array[${index}] = ${JSON.stringify(value)}`);
        
        await ctx.go("result", resultArray);
      },
      render: (props) => ({
        label: "SET",
        content: `array[${props.index ?? 0}] = ?`,
      }),
    });

    // Object Operations
    BlockRegistry.register("object", {
      displayName: "Object",
      category: "data",
      inputs: [],
      outputs: ["object"],
      defaultProps: { properties: {} },
      description: "Creates an object with properties",
      execute: async (ctx) => {
        const properties = ctx.inputs.properties ?? {};
        ctx.setValue("object", properties);
        ctx.log(`Object created with ${Object.keys(properties).length} properties`);
        await ctx.go("object", properties);
      },
      render: (props) => ({
        label: "OBJ",
        content: `{${Object.keys(props.properties || {}).length}}`,
      }),
    });

    BlockRegistry.register("object_get", {
      displayName: "Object Get",
      category: "data",
      inputs: ["object", "key"],
      outputs: ["value"],
      defaultProps: { key: "property" },
      description: "Gets a property value from an object",
      execute: async (ctx) => {
        const inputObject = ctx.inputs.object;
        const key = String(ctx.inputs.key ?? "property");
        
        let value = null;
        if (inputObject && typeof inputObject === "object" && !Array.isArray(inputObject)) {
          value = (inputObject as Record<string, unknown>)[key];
        }
        
        ctx.setValue("value", value);
        ctx.log(`Get object.${key} = ${JSON.stringify(value)}`);
        
        await ctx.go("value", value);
      },
      render: (props) => ({
        label: "GET",
        content: `obj.${props.key || "prop"}`,
      }),
    });

    BlockRegistry.register("object_set", {
      displayName: "Object Set",
      category: "data",
      inputs: ["object", "key", "value"],
      outputs: ["result"],
      defaultProps: { key: "property" },
      description: "Sets a property value on an object",
      execute: async (ctx) => {
        const inputObject = ctx.inputs.object;
        const key = String(ctx.inputs.key ?? "property");
        const value = ctx.inputs.value;
        
        let resultObject: Record<string, unknown>;
        if (inputObject && typeof inputObject === "object" && !Array.isArray(inputObject)) {
          resultObject = { ...(inputObject as Record<string, unknown>) };
        } else {
          resultObject = {};
        }
        
        resultObject[key] = value;
        
        ctx.setValue("result", resultObject);
        ctx.log(`Set object.${key} = ${JSON.stringify(value)}`);
        
        await ctx.go("result", resultObject);
      },
      render: (props) => ({
        label: "SET",
        content: `obj.${props.key || "prop"} = ?`,
      }),
    });

    BlockRegistry.register("counter", {
      displayName: "Counter",
      category: "data",
      inputs: ["increment"],
      outputs: ["count"],
      defaultProps: { value: 0, step: 1 },
      description: "Incremental counter",
      execute: async (ctx) => {
        const currentValue =
          (ctx.getValue("count") as number) ??
          (ctx.inputs.value as number) ??
          0;
        const step = (ctx.inputs.step as number) ?? 1;
        const newValue = currentValue + step;

        ctx.setValue("count", newValue);
        ctx.log(`Counter: ${currentValue} → ${newValue}`);
        await ctx.go("count", newValue);
      },
      render: (props) => ({
        label: "COUNT",
        content: String(props.value ?? 0),
      }),
    });

    BlockRegistry.register("counter_increment", {
      displayName: "Increment Counter",
      category: "data",
      inputs: ["trigger", "step"],
      outputs: ["count"],
      defaultProps: { initialValue: 0, step: 1 },
      description: "Increments a counter each time it receives input",
      execute: async (ctx) => {
        const step = Number(ctx.inputs.step ?? ctx.inputs.initialStep ?? 1);
        const currentCount = (ctx.getValue("count") as number) ?? Number(ctx.inputs.initialValue ?? 0);
        const newCount = currentCount + step;
        
        ctx.setValue("count", newCount);
        ctx.log(`Counter: ${currentCount} + ${step} = ${newCount}`);
        
        await ctx.go("count", newCount);
      },
      render: (props) => ({
        label: "INC",
        content: `+${props.step ?? 1}`,
        value: String(props.initialValue ?? 0),
      }),
    });

    BlockRegistry.register("counter_reset", {
      displayName: "Reset Counter",
      category: "data",
      inputs: ["trigger"],
      outputs: ["count"],
      defaultProps: { value: 0 },
      description: "Resets a counter to a specific value",
      execute: async (ctx) => {
        const resetValue = Number(ctx.inputs.value ?? 0);
        
        ctx.setValue("count", resetValue);
        ctx.log(`Counter reset to ${resetValue}`);
        
        await ctx.go("count", resetValue);
      },
      render: (props) => ({
        label: "RESET",
        content: `reset to ${props.value ?? 0}`,
      }),
    });

    // Control flow blocks
    BlockRegistry.register("function", {
      displayName: "Function",
      category: "control",
      inputs: ["input"],
      outputs: ["output"],
      defaultProps: { name: "fn", params: "" },
      description: "Function definition block",
      execute: async (ctx) => {
        const input = ctx.inputs.input;
        ctx.setValue("result", input);
        ctx.log(`Function ${ctx.inputs.name}: processing input`);
        await ctx.go("output", input);
      },
      render: (props) => ({
        label: "FN",
        content: String(props.name || "function"),
      }),
    });

    BlockRegistry.register("if", {
      displayName: "If",
      category: "control",
      inputs: ["condition"],
      outputs: ["true", "false"],
      defaultProps: { condition: true },
      description: "Conditional branching",
      execute: async (ctx) => {
        const condition = ctx.inputs.condition;
        ctx.log(`If condition: ${!!condition}`);
        
        if (condition) {
          await ctx.go("true", condition);
        } else {
          await ctx.go("false", condition);
        }
      },
      render: (props) => ({
        label: "IF",
        content: `condition: ${!!props.condition}`,
      }),
    });

    BlockRegistry.register("if_assign", {
      displayName: "If Assign",
      category: "control",
      inputs: ["condition", "trueValue", "falseValue"],
      outputs: ["result"],
      defaultProps: {},
      description: "Assigns different values based on condition",
      execute: async (ctx) => {
        const condition = ctx.inputs.condition;
        const trueValue = ctx.inputs.trueValue;
        const falseValue = ctx.inputs.falseValue;
        
        const result = condition ? trueValue : falseValue;
        
        ctx.setValue("result", result);
        ctx.log(`If assign: condition=${!!condition}, result=${JSON.stringify(result)}`);
        
        await ctx.go("result", result);
      },
      render: () => ({
        label: "IF=",
        content: "condition ? a : b",
      }),
    });

    BlockRegistry.register("loop", {
      displayName: "Loop",
      category: "control",
      inputs: ["items"],
      outputs: ["item"],
      defaultProps: { count: 3 },
      description: "Iterates over collection",
      execute: async (ctx) => {
        const items = ctx.inputs.items;
        if (Array.isArray(items)) {
          for (let i = 0; i < items.length; i++) {
            ctx.log(`Loop iteration ${i + 1}/${items.length}`);
            await ctx.go("item", items[i]);
          }
        } else {
          const count = (ctx.inputs.count as number) ?? 3;
          for (let i = 0; i < count; i++) {
            ctx.log(`Loop iteration ${i + 1}/${count}`);
            await ctx.go("item", i);
          }
        }
      },
      render: (props) => ({
        label: "LOOP",
        content: `×${props.count ?? "∞"}`,
      }),
    });

    BlockRegistry.register("while_loop", {
      displayName: "While Loop",
      category: "control",
      inputs: ["condition"],
      outputs: ["body", "done"],
      defaultProps: { maxIterations: 100 },
      description: "Loops while condition is true",
      execute: async (ctx) => {
        const maxIterations = Number(ctx.inputs.maxIterations ?? 100);
        let iterations = 0;
        
        while (iterations < maxIterations) {
          const condition = ctx.inputs.condition;
          
          // Simple truthiness check
          if (!condition) {
            break;
          }
          
          iterations++;
          ctx.log(`While loop iteration ${iterations}`);
          
          // Execute body
          await ctx.go("body", { iteration: iterations, condition });
          
          // Safety check to prevent infinite loops
          if (iterations >= maxIterations) {
            ctx.log(`While loop terminated after ${maxIterations} iterations (safety limit)`);
            break;
          }
        }
        
        ctx.log(`While loop completed after ${iterations} iterations`);
        await ctx.go("done", { iterations });
      },
      render: (props) => ({
        label: "WHILE",
        content: `max: ${props.maxIterations ?? 100}`,
      }),
    });

    BlockRegistry.register("for_range", {
      displayName: "For Range",
      category: "control",
      inputs: ["start", "end", "step"],
      outputs: ["body", "done"],
      defaultProps: { start: 0, end: 10, step: 1 },
      description: "Loops from start to end with step",
      execute: async (ctx) => {
        const start = Number(ctx.inputs.start ?? 0);
        const end = Number(ctx.inputs.end ?? 10);
        const step = Number(ctx.inputs.step ?? 1);
        
        if (step === 0) {
          ctx.log("Step cannot be zero");
          await ctx.go("done", { error: "Invalid step value" });
          return;
        }
        
        let current = start;
        let iterations = 0;
        const maxIterations = 1000; // Safety limit
        
        if (step > 0) {
          while (current < end && iterations < maxIterations) {
            iterations++;
            ctx.log(`For loop iteration ${iterations}: i = ${current}`);
            
            await ctx.go("body", { index: current, iteration: iterations });
            current += step;
          }
        } else {
          while (current > end && iterations < maxIterations) {
            iterations++;
            ctx.log(`For loop iteration ${iterations}: i = ${current}`);
            
            await ctx.go("body", { index: current, iteration: iterations });
            current += step;
          }
        }
        
        ctx.log(`For loop completed after ${iterations} iterations`);
        await ctx.go("done", { iterations, finalValue: current });
      },
      render: (props) => ({
        label: "FOR",
        content: `${props.start ?? 0}..${props.end ?? 10}`,
      }),
    });

    BlockRegistry.register("return", {
      displayName: "Return",
      category: "control",
      inputs: ["value"],
      outputs: [],
      defaultProps: { value: null },
      description: "Returns a value from function",
      execute: async (ctx) => {
        const value = ctx.inputs.value;
        ctx.log(`Return: ${JSON.stringify(value)}`);
        ctx.setValue("return", value);
      },
      render: (props) => ({
        label: "RETURN",
        content: String(props.value ?? "null"),
      }),
    });

    BlockRegistry.register("delay", {
      displayName: "Delay",
      category: "control",
      inputs: ["trigger"],
      outputs: ["done"],
      defaultProps: { ms: 1000 },
      description: "Delays execution for specified time",
      execute: async (ctx) => {
        const ms = Number(ctx.inputs.ms ?? 1000);
        ctx.log(`Delaying for ${ms}ms`);
        
        await new Promise(resolve => setTimeout(resolve, ms));
        
        ctx.log(`Delay completed`);
        await ctx.go("done", true);
      },
      render: (props) => ({
        label: "DELAY",
        content: `${props.ms ?? 1000}ms`,
      }),
    });

    // Math blocks
    BlockRegistry.register("add", {
      displayName: "Add",
      category: "math",
      inputs: ["a", "b"],
      outputs: ["sum"],
      defaultProps: { a: 0, b: 0 },
      description: "Adds two numbers",
      execute: async (ctx) => {
        const a = Number(ctx.inputs.a ?? 0);
        const b = Number(ctx.inputs.b ?? 0);
        const sum = a + b;

        ctx.setValue("result", sum);
        ctx.log(`${a} + ${b} = ${sum}`);
        await ctx.go("sum", sum);
      },
      render: (props) => ({
        label: "ADD",
        content: `${props.a ?? 0} + ${props.b ?? 0}`,
      }),
    });

    BlockRegistry.register("add_assign", {
      displayName: "Add Assign",
      category: "math",
      inputs: ["target", "value"],
      outputs: ["result"],
      defaultProps: {},
      description: "Adds value to target (target += value)",
      execute: async (ctx) => {
        const target = Number(ctx.inputs.target ?? 0);
        const value = Number(ctx.inputs.value ?? 0);
        const result = target + value;
        
        ctx.setValue("result", result);
        ctx.log(`Add assign: ${target} += ${value} = ${result}`);
        
        await ctx.go("result", result);
      },
      render: () => ({
        label: "+=",
        content: "target += value",
      }),
    });

    BlockRegistry.register("subtract", {
      displayName: "Subtract",
      category: "math",
      inputs: ["a", "b"],
      outputs: ["difference"],
      defaultProps: { a: 0, b: 0 },
      description: "Subtracts two numbers",
      execute: async (ctx) => {
        const a = Number(ctx.inputs.a ?? 0);
        const b = Number(ctx.inputs.b ?? 0);
        const difference = a - b;

        ctx.setValue("result", difference);
        ctx.log(`${a} - ${b} = ${difference}`);
        await ctx.go("difference", difference);
      },
      render: (props) => ({
        label: "SUB",
        content: `${props.a ?? 0} - ${props.b ?? 0}`,
      }),
    });

    BlockRegistry.register("multiply", {
      displayName: "Multiply",
      category: "math",
      inputs: ["a", "b"],
      outputs: ["product"],
      defaultProps: { a: 1, b: 1 },
      description: "Multiplies two numbers",
      execute: async (ctx) => {
        const a = Number(ctx.inputs.a ?? 1);
        const b = Number(ctx.inputs.b ?? 1);
        const product = a * b;

        ctx.setValue("result", product);
        ctx.log(`${a} × ${b} = ${product}`);
        await ctx.go("product", product);
      },
      render: (props) => ({
        label: "MUL",
        content: `${props.a ?? 1} × ${props.b ?? 1}`,
      }),
    });

    BlockRegistry.register("multiply_assign", {
      displayName: "Multiply Assign",
      category: "math",
      inputs: ["target", "value"],
      outputs: ["result"],
      defaultProps: {},
      description: "Multiplies target by value (target *= value)",
      execute: async (ctx) => {
        const target = Number(ctx.inputs.target ?? 1);
        const value = Number(ctx.inputs.value ?? 1);
        const result = target * value;
        
        ctx.setValue("result", result);
        ctx.log(`Multiply assign: ${target} *= ${value} = ${result}`);
        
        await ctx.go("result", result);
      },
      render: () => ({
        label: "*=",
        content: "target *= value",
      }),
    });

    BlockRegistry.register("divide", {
      displayName: "Divide",
      category: "math",
      inputs: ["a", "b"],
      outputs: ["quotient"],
      defaultProps: { a: 1, b: 1 },
      description: "Divides two numbers",
      execute: async (ctx) => {
        const a = Number(ctx.inputs.a ?? 1);
        const b = Number(ctx.inputs.b ?? 1);
        
        if (b === 0) {
          ctx.log("Cannot divide by zero");
          await ctx.go("quotient", Infinity);
          return;
        }
        
        const quotient = a / b;
        ctx.setValue("result", quotient);
        ctx.log(`${a} ÷ ${b} = ${quotient}`);
        await ctx.go("quotient", quotient);
      },
      render: (props) => ({
        label: "DIV",
        content: `${props.a ?? 1} ÷ ${props.b ?? 1}`,
      }),
    });

    BlockRegistry.register("modulo", {
      displayName: "Modulo",
      category: "math",
      inputs: ["a", "b"],
      outputs: ["remainder"],
      defaultProps: { a: 10, b: 3 },
      description: "Returns remainder of division",
      execute: async (ctx) => {
        const a = Number(ctx.inputs.a ?? 10);
        const b = Number(ctx.inputs.b ?? 3);
        
        if (b === 0) {
          ctx.log("Cannot modulo by zero");
          await ctx.go("remainder", NaN);
          return;
        }
        
        const remainder = a % b;
        ctx.setValue("result", remainder);
        ctx.log(`${a} % ${b} = ${remainder}`);
        await ctx.go("remainder", remainder);
      },
      render: (props) => ({
        label: "MOD",
        content: `${props.a ?? 10} % ${props.b ?? 3}`,
      }),
    });

    // Logic blocks
    BlockRegistry.register("compare", {
      displayName: "Compare",
      category: "logic",
      inputs: ["a", "b"],
      outputs: ["result"],
      defaultProps: { operator: "==" },
      description: "Compares two values",
      execute: async (ctx) => {
        const a = ctx.inputs.a;
        const b = ctx.inputs.b;
        const operator = ctx.inputs.operator || "==";
        
        let result = false;
        switch (operator) {
          case "==": result = a == b; break;
          case "===": result = a === b; break;
          case "!=": result = a != b; break;
          case "!==": result = a !== b; break;
          case "<": result = Number(a) < Number(b); break;
          case "<=": result = Number(a) <= Number(b); break;
          case ">": result = Number(a) > Number(b); break;
          case ">=": result = Number(a) >= Number(b); break;
          default: result = false;
        }
        
        ctx.setValue("result", result);
        ctx.log(`${JSON.stringify(a)} ${operator} ${JSON.stringify(b)} = ${result}`);
        await ctx.go("result", result);
      },
      render: (props) => ({
        label: "CMP",
        content: `a ${props.operator || "=="} b`,
      }),
    });

    BlockRegistry.register("and", {
      displayName: "AND",
      category: "logic",
      inputs: ["a", "b"],
      outputs: ["result"],
      defaultProps: {},
      description: "Logical AND operation",
      execute: async (ctx) => {
        const a = ctx.inputs.a;
        const b = ctx.inputs.b;
        const result = !!(a && b);
        
        ctx.setValue("result", result);
        ctx.log(`${!!a} AND ${!!b} = ${result}`);
        await ctx.go("result", result);
      },
      render: () => ({
        label: "AND",
        content: "a && b",
      }),
    });

    BlockRegistry.register("or", {
      displayName: "OR",
      category: "logic",
      inputs: ["a", "b"],
      outputs: ["result"],
      defaultProps: {},
      description: "Logical OR operation",
      execute: async (ctx) => {
        const a = ctx.inputs.a;
        const b = ctx.inputs.b;
        const result = !!(a || b);
        
        ctx.setValue("result", result);
        ctx.log(`${!!a} OR ${!!b} = ${result}`);
        await ctx.go("result", result);
      },
      render: () => ({
        label: "OR",
        content: "a || b",
      }),
    });

    BlockRegistry.register("not", {
      displayName: "NOT",
      category: "logic",
      inputs: ["value"],
      outputs: ["result"],
      defaultProps: {},
      description: "Logical NOT operation",
      execute: async (ctx) => {
        const value = ctx.inputs.value;
        const result = !value;
        
        ctx.setValue("result", result);
        ctx.log(`NOT ${!!value} = ${result}`);
        await ctx.go("result", result);
      },
      render: () => ({
        label: "NOT",
        content: "!value",
      }),
    });

    BlockRegistry.register("random", {
      displayName: "Random",
      category: "math",
      inputs: ["min", "max"],
      outputs: ["value"],
      defaultProps: { min: 0, max: 100 },
      description: "Generates random number",
      execute: async (ctx) => {
        const min = Number(ctx.inputs.min ?? 0);
        const max = Number(ctx.inputs.max ?? 100);
        const value = Math.floor(Math.random() * (max - min + 1)) + min;
        
        ctx.setValue("result", value);
        ctx.log(`Random(${min}, ${max}) = ${value}`);
        await ctx.go("value", value);
      },
      render: (props) => ({
        label: "RND",
        content: `${props.min ?? 0}-${props.max ?? 100}`,
      }),
    });

    // String operations
    BlockRegistry.register("string_concat", {
      displayName: "String Concat",
      category: "data",
      inputs: ["left", "right"],
      outputs: ["result"],
      defaultProps: { separator: "" },
      description: "Concatenates two strings",
      execute: async (ctx) => {
        const left = String(ctx.inputs.left ?? "");
        const right = String(ctx.inputs.right ?? "");
        const separator = String(ctx.inputs.separator ?? "");
        
        const result = left + separator + right;
        
        ctx.setValue("result", result);
        ctx.log(`Concat: "${left}" + "${separator}" + "${right}" = "${result}"`);
        
        await ctx.go("result", result);
      },
      render: (props) => ({
        label: "CONCAT",
        content: `"${props.separator || ''}"`,
      }),
    });

    // I/O blocks
    BlockRegistry.register("print", {
      displayName: "Print",
      category: "io",
      inputs: ["message"],
      outputs: [],
      defaultProps: { message: "Hello World" },
      description: "Outputs message to console",
      execute: async (ctx) => {
        const message = ctx.inputs.message ?? "Hello World";
        console.log("PRINT:", message);
        ctx.log(`Output: ${message}`);
      },
      render: (props) => ({
        label: "PRINT",
        content: String(props.message || "output"),
      }),
    });

    BlockRegistry.register("prompt", {
      displayName: "Input",
      category: "io",
      inputs: ["prompt"],
      outputs: ["value"],
      defaultProps: { prompt: "Enter value:" },
      description: "Gets user input",
      execute: async (ctx) => {
        const promptText = String(ctx.inputs.prompt ?? "Enter value:");
        const value = prompt(promptText) || "";
        
        ctx.setValue("result", value);
        ctx.log(`Input: "${value}"`);
        await ctx.go("value", value);
      },
      render: (props) => ({
        label: "INPUT",
        content: String(props.prompt || "input"),
      }),
    });

    // Utility blocks
    BlockRegistry.register("comment", {
      displayName: "Comment",
      category: "data",
      inputs: [],
      outputs: [],
      defaultProps: { text: "Comment..." },
      description: "Documentation comment block",
      execute: async (ctx) => {
        const text = ctx.inputs.text ?? "Comment";
        ctx.log(`Comment: ${text}`);
      },
      render: (props) => ({
        label: "//",
        content: String(props.text || "Comment..."),
      }),
    });

    console.log("All blocks registered successfully");
  } catch (error) {
    console.error("Failed to register blocks:", error);
  }
}

// Register all blocks on module load
registerAllBlocks();