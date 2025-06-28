/**
 * Executor - Handles program execution logic
 * Walks the connection graph and executes block logic
 */

import { BlockRegistry, type ExecutionContext } from './registry.js';
import type { ElementData, ConnectionData } from './renderer.js';

export interface ExecutionState {
  readonly elementStates: Map<string, Map<string, unknown>>;
  readonly executionLog: string[];
  readonly isRunning: boolean;
  readonly startTime?: number;
  readonly endTime?: number;
}

export interface ExecutionOptions {
  readonly maxExecutionTime?: number;
  readonly maxSteps?: number;
  readonly stepDelay?: number;
  readonly onElementStart?: (elementId: string) => void;
  readonly onElementComplete?: (elementId: string) => void;
  readonly onConnectionTraversed?: (connectionId: string) => void;
  readonly onLog?: (message: string) => void;
  readonly onError?: (error: Error, elementId?: string) => void;
}

export class ExecutionEngine {
  private readonly elements: Map<string, ElementData>;
  private readonly connections: Map<string, ConnectionData>;
  private readonly elementStates = new Map<string, Map<string, unknown>>();
  private readonly executionLog: string[] = [];
  private readonly processedElements = new Set<string>();
  
  private isRunning = false;
  private stepCount = 0;
  private startTime = 0;
  private currentOptions: ExecutionOptions = {};

  constructor(elements: Map<string, ElementData>, connections: Map<string, ConnectionData>) {
    if (!elements || !connections) {
      throw new TypeError('Elements and connections maps are required');
    }

    this.elements = elements;
    this.connections = connections;
  }

  /**
   * Execute the visual program
   */
  async execute(options: ExecutionOptions = {}): Promise<ExecutionState> {
    if (this.isRunning) {
      throw new Error('Execution already in progress');
    }

    this.reset();
    this.isRunning = true;
    this.startTime = Date.now();
    this.currentOptions = options;

    const maxTime = options.maxExecutionTime || 30000; // 30 second default timeout
    const maxSteps = options.maxSteps || 1000; // Maximum execution steps

    try {
      // Set up execution timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), maxTime);
      });

      // Execute with timeout
      const executionPromise = this.executeInternal(maxSteps);
      const timer = setTimeout(() => {
        this.isRunning = false;
      }, maxTime);
      
      try {
        await Promise.race([executionPromise, timeoutPromise]);
      } finally {
        clearTimeout(timer);
      }

      this.log('Execution completed successfully');
      
    } catch (error) {
      this.log(`Execution failed: ${error instanceof Error ? error.message : String(error)}`);
      this.currentOptions.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      this.isRunning = false;
    }

    return this.getExecutionState();
  }

  /**
   * Stop execution if running
   */
  stop(): void {
    if (this.isRunning) {
      this.isRunning = false;
      this.log('Execution stopped by user');
    }
  }

  /**
   * Get current execution state
   */
  getExecutionState(): ExecutionState {
    return {
      elementStates: new Map(this.elementStates),
      executionLog: [...this.executionLog],
      isRunning: this.isRunning,
      startTime: this.startTime,
      endTime: this.isRunning ? undefined : Date.now()
    };
  }

  /**
   * Reset execution state
   */
  reset(): void {
    this.elementStates.clear();
    this.executionLog.length = 0;
    this.processedElements.clear();
    this.stepCount = 0;
    this.isRunning = false;
  }

  /**
   * Internal execution logic
   */
  private async executeInternal(maxSteps: number): Promise<void> {
    // Validate graph before execution
    this.validateGraph();
    
    // Find entry points (elements with no inputs or connections)
    const entryPoints = this.findEntryPoints();
    
    if (entryPoints.length === 0) {
      this.log('No entry points found - looking for any elements to start execution');
      // If no clear entry points, start with first available element
      const firstElement = this.elements.values().next().value;
      if (firstElement) {
        entryPoints.push(firstElement.id);
      }
    }

    this.log(`Starting execution from ${entryPoints.length} entry point(s): ${entryPoints.join(', ')}`);

    // Execute from each entry point
    for (const entryId of entryPoints) {
      if (!this.isRunning || this.stepCount >= maxSteps) break;
      await this.executeFromElement(entryId);
    }
  }

  /**
   * Find elements that can serve as entry points
   */
  private findEntryPoints(): string[] {
    const elementsWithInputConnections = new Set<string>();
    
    // Find all elements that have incoming connections
    this.connections.forEach(connection => {
      elementsWithInputConnections.add(connection.toId);
    });

    // Entry points are elements without incoming connections
    const entryPoints: string[] = [];
    this.elements.forEach((element, id) => {
      if (!elementsWithInputConnections.has(id)) {
        entryPoints.push(id);
      }
    });

    return entryPoints;
  }

  /**
   * Execute starting from a specific element
   */
  private async executeFromElement(elementId: string): Promise<void> {
    if (!this.isRunning || this.processedElements.has(elementId)) {
      return;
    }

    this.stepCount++;
    if (this.stepCount > (this.currentOptions.maxSteps || 1000)) {
      throw new Error('Maximum execution steps exceeded');
    }

    const element = this.elements.get(elementId);
    if (!element) {
      throw new Error(`Element not found: ${elementId}`);
    }

    const definition = BlockRegistry.get(element.type);
    if (!definition) {
      throw new Error(`Unknown block type: ${element.type}`);
    }

    this.processedElements.add(elementId);
    this.currentOptions.onElementStart?.(elementId);

    try {
      // Create execution context
      const context = this.createExecutionContext(elementId);
      
      // Execute the element
      if (definition.execute) {
        await definition.execute(context);
      }

      // Add delay if specified
      const stepDelay = this.currentOptions.stepDelay ?? 0;
      if (stepDelay > 0) {
        await this.delay(stepDelay);
      }

      this.currentOptions.onElementComplete?.(elementId);
      
    } catch (error) {
      const errorMessage = `Error executing element ${elementId}: ${error instanceof Error ? error.message : String(error)}`;
      this.log(errorMessage);
      this.currentOptions.onError?.(error instanceof Error ? error : new Error(String(error)), elementId);
      throw error;
    }
  }

  /**
   * Create execution context for an element
   */
  private createExecutionContext(elementId: string): ExecutionContext {
    const element = this.elements.get(elementId);
    if (!element) {
      throw new Error(`Element not found: ${elementId}`);
    }

    // Get element state
    let elementState = this.elementStates.get(elementId);
    if (!elementState) {
      elementState = new Map();
      this.elementStates.set(elementId, elementState);
    }

    // Collect inputs from connected elements
    const inputs: Record<string, unknown> = {};
    this.connections.forEach(connection => {
      if (connection.toId === elementId) {
        const fromState = this.elementStates.get(connection.fromId);
        if (fromState) {
          // For now, pass the last output value
          const outputValues = Array.from(fromState.values());
          if (outputValues.length > 0) {
            inputs[connection.toInput || 'input'] = outputValues[outputValues.length - 1];
          }
        }
      }
    });

    // Add element properties as inputs
    Object.assign(inputs, element.props);

    return {
      elementId,
      inputs,
      state: this.elementStates,
      connections: this.getConnectionsMap(),
      
      go: async (output: string, value?: unknown) => {
        // Store output value in element state
        elementState!.set(output, value);
        
        // Find and execute connected elements
        const outgoingConnections = Array.from(this.connections.values())
          .filter(conn => conn.fromId === elementId);
          
        for (const connection of outgoingConnections) {
          if (!this.isRunning) break;
          
          this.currentOptions.onConnectionTraversed?.(connection.id);
          await this.executeFromElement(connection.toId);
        }
      },

      setValue: (key: string, value: unknown) => {
        elementState!.set(key, value);
      },

      getValue: (key: string) => {
        return elementState!.get(key);
      },

      log: (message: string) => {
        this.log(`[${elementId}] ${message}`);
      }
    };
  }

  /**
   * Get connections as a map for context
   */
  private getConnectionsMap(): Map<string, string[]> {
    const connectionsMap = new Map<string, string[]>();
    
    this.connections.forEach(connection => {
      const existing = connectionsMap.get(connection.fromId) || [];
      existing.push(connection.toId);
      connectionsMap.set(connection.fromId, existing);
    });
    
    return connectionsMap;
  }

  /**
   * Add message to execution log
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const logEntry = `[${timestamp}] ${message}`;
    this.executionLog.push(logEntry);
    this.currentOptions.onLog?.(logEntry);
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Find cycles in the connection graph
   */
  private findCycles(): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (nodeId: string, path: string[]): void => {
      if (recursionStack.has(nodeId)) {
        // Found a cycle
        const cycleStart = path.indexOf(nodeId);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart));
        }
        return;
      }

      if (visited.has(nodeId)) {
        return;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      // Visit all connected nodes
      this.connections.forEach(connection => {
        if (connection.fromId === nodeId) {
          dfs(connection.toId, [...path]);
        }
      });

      recursionStack.delete(nodeId);
    };

    // Check for cycles starting from each node
    this.elements.forEach((_, nodeId) => {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    });

    return cycles;
  }

  /**
   * Validate the program graph before execution
   */
  private validateGraph(): void {
    // Check for cycles
    const cycles = this.findCycles();
    if (cycles.length > 0) {
      this.log(`Warning: Found ${cycles.length} cycles in the graph`);
      cycles.forEach((cycle, index) => {
        this.log(`Cycle ${index + 1}: ${cycle.join(' → ')}`);
      });
    }

    // Check for orphaned elements
    const connectedElements = new Set<string>();
    this.connections.forEach(connection => {
      connectedElements.add(connection.fromId);
      connectedElements.add(connection.toId);
    });

    const orphanedElements = Array.from(this.elements.keys())
      .filter(id => !connectedElements.has(id));

    if (orphanedElements.length > 0) {
      this.log(`Found ${orphanedElements.length} unconnected elements: ${orphanedElements.join(', ')}`);
    }

    // Validate block types
    this.elements.forEach((element, id) => {
      const definition = BlockRegistry.get(element.type);
      if (!definition) {
        throw new Error(`Unknown block type "${element.type}" in element ${id}`);
      }

      // Validate block properties if validator exists
      if (definition.validate) {
        const validationError = definition.validate(element.props);
        if (validationError) {
          throw new Error(`Validation error in element ${id}: ${validationError}`);
        }
      }
    });
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(): {
    totalElements: number;
    processedElements: number;
    totalConnections: number;
    executionTime: number;
    stepCount: number;
  } {
    return {
      totalElements: this.elements.size,
      processedElements: this.processedElements.size,
      totalConnections: this.connections.size,
      executionTime: this.isRunning ? Date.now() - this.startTime : 0,
      stepCount: this.stepCount
    };
  }

  /**
   * Debug: Get current element states
   */
  getElementStates(): Map<string, Map<string, unknown>> {
    return new Map(this.elementStates);
  }

  /**
   * Debug: Get processed elements
   */
  getProcessedElements(): Set<string> {
    return new Set(this.processedElements);
  }
}

// Export types for external use
export type { ElementData, ConnectionData } from './renderer.js';

/**
 * Utility function to create and run executor
 */
export async function executeProgram(
  elements: Map<string, ElementData>, 
  connections: Map<string, ConnectionData>, 
  options: ExecutionOptions = {}
): Promise<ExecutionState> {
  const executor = new ExecutionEngine(elements, connections);
  return await executor.execute(options);
}