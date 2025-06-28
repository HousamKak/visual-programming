/**
 * Executor - Handles program execution logic
 * Walks the connection graph and executes block logic
 */

import { BlockRegistry, type ExecutionContext } from './registry.js';
import type { ElementData, ConnectionData } from './renderer.js';

export interface ExecutionState {
  readonly elementStates: Map<string, Map<string, unknown>>;
  readonly executionLog: readonly string[];
  readonly isRunning: boolean;
  readonly startTime?: number;
  readonly endTime?: number;
  readonly errorCount: number;
  readonly successCount: number;
}

export interface ExecutionOptions {
  readonly maxExecutionTime?: number;
  readonly maxSteps?: number;
  readonly stepDelay?: number;
  readonly enableCycleDetection?: boolean;
  readonly onElementStart?: (elementId: string) => void;
  readonly onElementComplete?: (elementId: string) => void;
  readonly onConnectionTraversed?: (connectionId: string) => void;
  readonly onLog?: (message: string) => void;
  readonly onError?: (error: Error, elementId?: string) => void;
}

interface ExecutionStats {
  readonly totalElements: number;
  readonly processedElements: number;
  readonly totalConnections: number;
  readonly executionTime: number;
  readonly stepCount: number;
  readonly errorCount: number;
  readonly successCount: number;
}

/**
 * ExecutionEngine handles the execution of visual programs
 * with comprehensive error handling and cycle detection
 */
export class ExecutionEngine {
  private readonly elements: ReadonlyMap<string, ElementData>;
  private readonly connections: ReadonlyMap<string, ConnectionData>;
  private readonly elementStates = new Map<string, Map<string, unknown>>();
  private readonly executionLog: string[] = [];
  private readonly processedElements = new Set<string>();
  
  private isRunning = false;
  private stepCount = 0;
  private startTime = 0;
  private errorCount = 0;
  private successCount = 0;
  private currentOptions: ExecutionOptions = {};

  /**
   * Creates a new ExecutionEngine instance
   * @param elements - Map of element IDs to element data
   * @param connections - Map of connection IDs to connection data
   * @throws {TypeError} If elements or connections are not provided
   */
  constructor(elements: Map<string, ElementData>, connections: Map<string, ConnectionData>) {
    if (!elements || !(elements instanceof Map)) {
      throw new TypeError('Elements must be a valid Map instance');
    }
    if (!connections || !(connections instanceof Map)) {
      throw new TypeError('Connections must be a valid Map instance');
    }

    this.elements = new Map(elements);
    this.connections = new Map(connections);
    
    this.validateInputMaps();
  }

  /**
   * Execute the visual program with comprehensive error handling
   * @param options - Execution configuration options
   * @returns Promise resolving to execution state
   * @throws {Error} If execution is already in progress or times out
   */
  async execute(options: ExecutionOptions = {}): Promise<ExecutionState> {
    if (this.isRunning) {
      throw new Error('Execution already in progress - cannot start new execution');
    }

    this.validateExecutionOptions(options);
    this.reset();
    this.isRunning = true;
    this.startTime = Date.now();
    this.currentOptions = { ...options };

    const maxTime = options.maxExecutionTime ?? 30000;
    const maxSteps = options.maxSteps ?? 1000;

    try {
      this.log('Starting execution with options', JSON.stringify(options));
      
      // Set up execution timeout
      const executionPromise = this.executeInternal(maxSteps);
      const timeoutPromise = this.createTimeoutPromise(maxTime);
      
      await Promise.race([executionPromise, timeoutPromise]);
      
      this.log(`Execution completed successfully. Processed ${this.processedElements.size} elements in ${this.stepCount} steps`);
      this.successCount++;
      
    } catch (error) {
      this.errorCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Execution failed: ${errorMessage}`);
      this.currentOptions.onError?.(error instanceof Error ? error : new Error(errorMessage));
      throw error;
    } finally {
      this.isRunning = false;
    }

    return this.getExecutionState();
  }

  /**
   * Stop execution if currently running
   */
  stop(): void {
    if (this.isRunning) {
      this.isRunning = false;
      this.log('Execution stopped by user request');
    }
  }

  /**
   * Get current execution state as immutable snapshot
   */
  getExecutionState(): ExecutionState {
    return {
      elementStates: new Map(Array.from(this.elementStates.entries()).map(
        ([key, value]) => [key, new Map(value)]
      )),
      executionLog: [...this.executionLog],
      isRunning: this.isRunning,
      startTime: this.startTime,
      endTime: this.isRunning ? undefined : Date.now(),
      errorCount: this.errorCount,
      successCount: this.successCount
    };
  }

  /**
   * Reset execution state to initial conditions
   */
  reset(): void {
    this.elementStates.clear();
    this.executionLog.length = 0;
    this.processedElements.clear();
    this.stepCount = 0;
    this.errorCount = 0;
    this.isRunning = false;
  }

  /**
   * Get detailed execution statistics
   */
  getExecutionStats(): ExecutionStats {
    return {
      totalElements: this.elements.size,
      processedElements: this.processedElements.size,
      totalConnections: this.connections.size,
      executionTime: this.isRunning ? Date.now() - this.startTime : 0,
      stepCount: this.stepCount,
      errorCount: this.errorCount,
      successCount: this.successCount
    };
  }

  /**
   * Internal execution logic with comprehensive validation
   */
  private async executeInternal(maxSteps: number): Promise<void> {
    this.validateGraphIntegrity();
    
    const entryPoints = this.findEntryPoints();
    
    if (entryPoints.length === 0) {
      this.log('No entry points found - attempting to start from any available element');
      const firstElement = Array.from(this.elements.keys())[0];
      if (firstElement) {
        entryPoints.push(firstElement);
      } else {
        throw new Error('No elements available for execution');
      }
    }

    this.log(`Starting execution from ${entryPoints.length} entry point(s): ${entryPoints.join(', ')}`);

    for (const entryId of entryPoints) {
      if (!this.isRunning || this.stepCount >= maxSteps) {
        break;
      }
      
      try {
        await this.executeFromElement(entryId);
      } catch (error) {
        this.log(`Failed to execute from entry point ${entryId}: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with other entry points unless it's a critical error
        if (error instanceof Error && error.message.includes('Maximum execution steps')) {
          throw error;
        }
      }
    }
  }

  /**
   * Find elements that can serve as execution entry points
   */
  private findEntryPoints(): string[] {
    const elementsWithInputConnections = new Set<string>();
    
    for (const connection of this.connections.values()) {
      if (connection.toId) {
        elementsWithInputConnections.add(connection.toId);
      }
    }

    const entryPoints: string[] = [];
    for (const [elementId] of this.elements) {
      if (!elementsWithInputConnections.has(elementId)) {
        entryPoints.push(elementId);
      }
    }

    return entryPoints;
  }

  /**
   * Execute starting from a specific element with proper error isolation
   */
  private async executeFromElement(elementId: string): Promise<void> {
    if (!this.isRunning || this.processedElements.has(elementId)) {
      return;
    }

    if (!this.isValidElementId(elementId)) {
      throw new Error(`Invalid element ID: ${elementId}`);
    }

    this.stepCount++;
    if (this.stepCount > (this.currentOptions.maxSteps ?? 1000)) {
      throw new Error(`Maximum execution steps exceeded (${this.stepCount})`);
    }

    const element = this.elements.get(elementId);
    if (!element) {
      throw new Error(`Element not found: ${elementId}`);
    }

    const definition = BlockRegistry.get(element.type);
    if (!definition) {
      throw new Error(`Unknown block type: ${element.type} for element ${elementId}`);
    }

    this.processedElements.add(elementId);
    this.currentOptions.onElementStart?.(elementId);

    try {
      const context = this.createExecutionContext(elementId);
      
      if (definition.execute) {
        await this.executeWithTimeout(definition.execute, context, elementId);
      }

      const stepDelay = this.currentOptions.stepDelay ?? 0;
      if (stepDelay > 0) {
        await this.delay(stepDelay);
      }

      this.currentOptions.onElementComplete?.(elementId);
      
    } catch (error) {
      const errorMessage = `Error executing element ${elementId} (${element.type}): ${error instanceof Error ? error.message : String(error)}`;
      this.log(errorMessage);
      this.currentOptions.onError?.(error instanceof Error ? error : new Error(errorMessage), elementId);
      throw error;
    }
  }

  /**
   * Create execution context with comprehensive input validation
   */
  private createExecutionContext(elementId: string): ExecutionContext {
    const element = this.elements.get(elementId);
    if (!element) {
      throw new Error(`Element not found: ${elementId}`);
    }

    let elementState = this.elementStates.get(elementId);
    if (!elementState) {
      elementState = new Map<string, unknown>();
      this.elementStates.set(elementId, elementState);
    }

    const inputs = this.collectElementInputs(elementId);
    const safeProps = this.sanitizeProps(element.props);
    Object.assign(inputs, safeProps);

    return {
      elementId,
      inputs,
      state: this.elementStates,
      connections: this.getConnectionsMap(),
      
      go: async (output: string, value?: unknown) => {
        this.validateOutputParameters(output, value);
        elementState!.set(output, value);
        
        const outgoingConnections = Array.from(this.connections.values())
          .filter(conn => conn.fromId === elementId);
          
        for (const connection of outgoingConnections) {
          if (!this.isRunning) break;
          
          this.currentOptions.onConnectionTraversed?.(connection.id);
          await this.executeFromElement(connection.toId);
        }
      },

      setValue: (key: string, value: unknown) => {
        if (typeof key !== 'string' || key.trim() === '') {
          throw new TypeError('Key must be a non-empty string');
        }
        elementState!.set(key, value);
      },

      getValue: (key: string) => {
        if (typeof key !== 'string') {
          throw new TypeError('Key must be a string');
        }
        return elementState!.get(key);
      },

      log: (message: string) => {
        if (typeof message !== 'string') {
          message = String(message);
        }
        this.log(`[${elementId}] ${message}`);
      }
    };
  }

  /**
   * Collect inputs from connected elements with type safety
   */
  private collectElementInputs(elementId: string): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};
    
    for (const connection of this.connections.values()) {
      if (connection.toId === elementId) {
        const fromState = this.elementStates.get(connection.fromId);
        if (fromState && fromState.size > 0) {
          const outputValues = Array.from(fromState.values());
          if (outputValues.length > 0) {
            const inputKey = connection.toInput ?? 'input';
            inputs[inputKey] = outputValues[outputValues.length - 1];
          }
        }
      }
    }
    
    return inputs;
  }

  /**
   * Sanitize element properties to prevent injection attacks
   */
  private sanitizeProps(props: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(props)) {
      if (typeof key === 'string' && key.trim() !== '') {
        // Basic sanitization - can be extended based on security requirements
        if (typeof value === 'string') {
          sanitized[key] = value.slice(0, 10000); // Limit string length
        } else if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
          sanitized[key] = value;
        } else if (typeof value === 'boolean') {
          sanitized[key] = value;
        } else if (Array.isArray(value)) {
          sanitized[key] = value.slice(0, 1000); // Limit array size
        } else if (value === null || value === undefined) {
          sanitized[key] = value;
        } else {
          sanitized[key] = String(value).slice(0, 1000);
        }
      }
    }
    
    return sanitized;
  }

  /**
   * Get connections map for execution context
   */
  private getConnectionsMap(): Map<string, string[]> {
    const connectionsMap = new Map<string, string[]>();
    
    for (const connection of this.connections.values()) {
      if (!connection.fromId || !connection.toId) continue;
      
      const existing = connectionsMap.get(connection.fromId) ?? [];
      existing.push(connection.toId);
      connectionsMap.set(connection.fromId, existing);
    }
    
    return connectionsMap;
  }

  /**
   * Validate execution options with comprehensive checks
   */
  private validateExecutionOptions(options: ExecutionOptions): void {
    if (options.maxExecutionTime !== undefined) {
      if (typeof options.maxExecutionTime !== 'number' || options.maxExecutionTime <= 0) {
        throw new TypeError('maxExecutionTime must be a positive number');
      }
      if (options.maxExecutionTime > 300000) { // 5 minutes max
        throw new RangeError('maxExecutionTime cannot exceed 300000ms (5 minutes)');
      }
    }

    if (options.maxSteps !== undefined) {
      if (typeof options.maxSteps !== 'number' || options.maxSteps <= 0 || !Number.isInteger(options.maxSteps)) {
        throw new TypeError('maxSteps must be a positive integer');
      }
      if (options.maxSteps > 10000) {
        throw new RangeError('maxSteps cannot exceed 10000');
      }
    }

    if (options.stepDelay !== undefined) {
      if (typeof options.stepDelay !== 'number' || options.stepDelay < 0) {
        throw new TypeError('stepDelay must be a non-negative number');
      }
      if (options.stepDelay > 5000) {
        throw new RangeError('stepDelay cannot exceed 5000ms');
      }
    }
  }

  /**
   * Validate input maps for required structure and data integrity
   */
  private validateInputMaps(): void {
    for (const [elementId, element] of this.elements) {
      if (typeof elementId !== 'string' || elementId.trim() === '') {
        throw new TypeError('Element ID must be a non-empty string');
      }
      
      if (!element || typeof element !== 'object') {
        throw new TypeError(`Element data must be an object for element ${elementId}`);
      }
      
      if (typeof element.type !== 'string' || element.type.trim() === '') {
        throw new TypeError(`Element type must be a non-empty string for element ${elementId}`);
      }
      
      if (typeof element.x !== 'number' || typeof element.y !== 'number') {
        throw new TypeError(`Element coordinates must be numbers for element ${elementId}`);
      }
      
      if (!element.props || typeof element.props !== 'object') {
        throw new TypeError(`Element props must be an object for element ${elementId}`);
      }
    }

    for (const [connectionId, connection] of this.connections) {
      if (typeof connectionId !== 'string' || connectionId.trim() === '') {
        throw new TypeError('Connection ID must be a non-empty string');
      }
      
      if (!connection || typeof connection !== 'object') {
        throw new TypeError(`Connection data must be an object for connection ${connectionId}`);
      }
      
      if (typeof connection.fromId !== 'string' || typeof connection.toId !== 'string') {
        throw new TypeError(`Connection fromId and toId must be strings for connection ${connectionId}`);
      }
      
      if (!this.elements.has(connection.fromId)) {
        throw new ReferenceError(`Connection references non-existent fromId: ${connection.fromId}`);
      }
      
      if (!this.elements.has(connection.toId)) {
        throw new ReferenceError(`Connection references non-existent toId: ${connection.toId}`);
      }
    }
  }

  /**
   * Validate graph integrity including cycle detection
   */
  private validateGraphIntegrity(): void {
    if (this.currentOptions.enableCycleDetection !== false) {
      const cycles = this.findCycles();
      if (cycles.length > 0) {
        this.log(`Warning: Found ${cycles.length} cycle(s) in the execution graph`);
        cycles.forEach((cycle, index) => {
          this.log(`Cycle ${index + 1}: ${cycle.join(' → ')}`);
        });
        
        // Allow cycles but warn about potential infinite loops
        if (cycles.some(cycle => cycle.length > 10)) {
          throw new Error('Detected potentially dangerous long cycles in execution graph');
        }
      }
    }

    // Validate block type registrations
    for (const element of this.elements.values()) {
      const definition = BlockRegistry.get(element.type);
      if (!definition) {
        throw new Error(`Unknown block type "${element.type}" - ensure all required blocks are registered`);
      }

      if (definition.validate) {
        const validationError = definition.validate(element.props);
        if (validationError) {
          throw new Error(`Validation error in element ${element.id}: ${validationError}`);
        }
      }
    }
  }

  /**
   * Find cycles in the connection graph using DFS
   */
  private findCycles(): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (nodeId: string, path: string[]): void => {
      if (recursionStack.has(nodeId)) {
        const cycleStart = path.indexOf(nodeId);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), nodeId]);
        }
        return;
      }

      if (visited.has(nodeId)) {
        return;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      for (const connection of this.connections.values()) {
        if (connection.fromId === nodeId) {
          dfs(connection.toId, [...path, nodeId]);
        }
      }

      recursionStack.delete(nodeId);
    };

    for (const elementId of this.elements.keys()) {
      if (!visited.has(elementId)) {
        dfs(elementId, []);
      }
    }

    return cycles;
  }

  /**
   * Execute block function with timeout protection
   */
  private async executeWithTimeout(
    executeFunction: (ctx: ExecutionContext) => Promise<void>,
    context: ExecutionContext,
    elementId: string
  ): Promise<void> {
    const executionTimeout = 5000; // 5 second timeout per block
    
    const executionPromise = executeFunction(context);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Block execution timeout (${executionTimeout}ms) for element ${elementId}`));
      }, executionTimeout);
    });

    await Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Create timeout promise for overall execution
   */
  private createTimeoutPromise(maxTime: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Execution timeout after ${maxTime}ms`));
      }, maxTime);
    });
  }

  /**
   * Validate output parameters for go() method
   */
  private validateOutputParameters(output: string, value: unknown): void {
    if (typeof output !== 'string' || output.trim() === '') {
      throw new TypeError('Output name must be a non-empty string');
    }
    
    // Check for reasonable value sizes to prevent memory issues
    if (typeof value === 'string' && value.length > 100000) {
      throw new RangeError('Output string value too large (max 100KB)');
    }
    
    if (Array.isArray(value) && value.length > 10000) {
      throw new RangeError('Output array too large (max 10000 elements)');
    }
  }

  /**
   * Validate element ID format and existence
   */
  private isValidElementId(elementId: string): boolean {
    return typeof elementId === 'string' && 
           elementId.trim() !== '' && 
           this.elements.has(elementId);
  }

  /**
   * Add timestamped message to execution log
   */
  private log(message: string, details?: string): void {
    if (typeof message !== 'string') {
      message = String(message);
    }
    
    const timestamp = new Date().toISOString().split('T')[1]?.split('.')[0] ?? '00:00:00';
    const logEntry = details 
      ? `[${timestamp}] ${message} - ${details}`
      : `[${timestamp}] ${message}`;
      
    this.executionLog.push(logEntry);
    this.currentOptions.onLog?.(logEntry);
  }

  /**
   * Utility delay function with cancellation support
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);
      
      // Store timeout for potential cancellation
      if (!this.isRunning) {
        clearTimeout(timeout);
        resolve();
      }
    });
  }
}

/**
 * Utility function to create and run executor with validation
 * @param elements - Map of elements to execute
 * @param connections - Map of connections between elements
 * @param options - Execution options
 * @returns Promise resolving to execution state
 */
export async function executeProgram(
  elements: Map<string, ElementData>, 
  connections: Map<string, ConnectionData>, 
  options: ExecutionOptions = {}
): Promise<ExecutionState> {
  if (!elements || !(elements instanceof Map)) {
    throw new TypeError('Elements must be a Map instance');
  }
  
  if (!connections || !(connections instanceof Map)) {
    throw new TypeError('Connections must be a Map instance');
  }

  const executor = new ExecutionEngine(elements, connections);
  return await executor.execute(options);
}