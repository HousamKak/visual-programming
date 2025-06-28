/**
 * Editor - Handles drag & drop, connections, and user interactions
 * Main UI logic for the visual programming interface with comprehensive error handling
 */

import { Renderer, type ElementData, type ConnectionData } from '../core/renderer.js';
import { BlockRegistry } from '../core/registry.js';
import { ExecutionEngine, type ExecutionOptions } from '../core/executor.js';

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export interface EditorOptions {
  readonly canvas: HTMLElement;
  readonly connectionsSvg: SVGElement;
  readonly snapToGrid?: boolean;
  readonly gridSize?: number;
  readonly maxElements?: number;
  readonly maxConnections?: number;
  readonly enableKeyboardShortcuts?: boolean;
  readonly enableAutoSave?: boolean;
  readonly autoSaveInterval?: number;
  readonly onElementAdded?: (element: ElementData) => void;
  readonly onElementRemoved?: (elementId: string) => void;
  readonly onConnectionAdded?: (connection: ConnectionData) => void;
  readonly onConnectionRemoved?: (connectionId: string) => void;
  readonly onStatusUpdate?: (message: string, type?: 'success' | 'error' | 'running') => void;
  readonly onSelectionChanged?: (elementId: string | null) => void;
  readonly onCanvasChanged?: () => void;
}

interface DragState {
  isDragging: boolean;
  selectedElement: HTMLElement | null;
  dragOffset: { x: number; y: number };
  startPosition: { x: number; y: number };
}

interface ConnectionState {
  connectMode: boolean;
  selectedOutput: { elementId: string; element: HTMLElement } | null;
}

interface EditorStats {
  readonly elementCount: number;
  readonly connectionCount: number;
  readonly selectedElement: string | null;
  readonly isConnectMode: boolean;
  readonly isDragging: boolean;
}

// ---------------------------------------------------------------------------
// Validation Functions
// ---------------------------------------------------------------------------

/**
 * Validates editor options
 */
function validateEditorOptions(options: EditorOptions): void {
  if (!options || typeof options !== 'object') {
    throw new TypeError('Editor options must be an object');
  }

  if (!options.canvas || !(options.canvas instanceof HTMLElement)) {
    throw new TypeError('Canvas must be a valid HTMLElement');
  }

  if (!options.connectionsSvg || !(options.connectionsSvg instanceof SVGElement)) {
    throw new TypeError('Connections SVG must be a valid SVGElement');
  }

  if (options.gridSize !== undefined) {
    if (typeof options.gridSize !== 'number' || options.gridSize <= 0 || options.gridSize > 100) {
      throw new RangeError('Grid size must be a number between 1 and 100');
    }
  }

  if (options.maxElements !== undefined) {
    if (typeof options.maxElements !== 'number' || options.maxElements <= 0 || options.maxElements > 10000) {
      throw new RangeError('Max elements must be a number between 1 and 10000');
    }
  }

  if (options.maxConnections !== undefined) {
    if (typeof options.maxConnections !== 'number' || options.maxConnections <= 0 || options.maxConnections > 20000) {
      throw new RangeError('Max connections must be a number between 1 and 20000');
    }
  }

  if (options.autoSaveInterval !== undefined) {
    if (typeof options.autoSaveInterval !== 'number' || options.autoSaveInterval < 1000) {
      throw new RangeError('Auto save interval must be at least 1000ms');
    }
  }
}

/**
 * Validates element type string
 */
function validateElementType(type: unknown): asserts type is string {
  if (typeof type !== 'string') {
    throw new TypeError('Element type must be a string');
  }
  if (type.trim() === '') {
    throw new TypeError('Element type cannot be empty');
  }
  if (type.length > 50) {
    throw new TypeError('Element type too long (max 50 characters)');
  }
}

/**
 * Validates coordinate values
 */
function validateCoordinates(x: unknown, y: unknown): void {
  if (typeof x !== 'number' || !isFinite(x)) {
    throw new TypeError('X coordinate must be a finite number');
  }
  if (typeof y !== 'number' || !isFinite(y)) {
    throw new TypeError('Y coordinate must be a finite number');
  }
  if (x < -10000 || x > 50000 || y < -10000 || y > 50000) {
    throw new RangeError('Coordinates must be within valid range (-10000 to 50000)');
  }
}


/**
 * Sanitizes props object
 */
function sanitizeProps(props: unknown): Record<string, unknown> {
  if (!props || typeof props !== 'object' || Array.isArray(props)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  const propsObj = props as Record<string, unknown>;

  for (const [key, value] of Object.entries(propsObj)) {
    if (typeof key === 'string' && key.length <= 100) {
      if (value === null || value === undefined) {
        sanitized[key] = value;
      } else if (typeof value === 'string') {
        sanitized[key] = value.slice(0, 10000);
      } else if (typeof value === 'number' && isFinite(value)) {
        sanitized[key] = value;
      } else if (typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        sanitized[key] = value.slice(0, 1000);
      } else {
        sanitized[key] = String(value).slice(0, 1000);
      }
    }
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// Editor Implementation
// ---------------------------------------------------------------------------

/**
 * Editor handles all user interactions for the visual programming interface
 * with comprehensive error handling and resource management
 */
export class Editor {
  private readonly renderer: Renderer;
  private readonly options: EditorOptions;
  
  private readonly elements = new Map<string, ElementData>();
  private readonly domElements = new Map<string, HTMLElement>();
  private readonly connections = new Map<string, ConnectionData>();
  
  private idCounter = 0;
  private readonly dragState: DragState = {
    isDragging: false,
    selectedElement: null,
    dragOffset: { x: 0, y: 0 },
    startPosition: { x: 0, y: 0 }
  };
  
  private readonly connectionState: ConnectionState = {
    connectMode: false,
    selectedOutput: null
  };

  private autoSaveTimer?: number;
  private isDisposed = false;
  private eventAbortController?: AbortController;

  /**
   * Creates a new Editor instance
   * @param options - Editor configuration options
   * @throws {TypeError} If options are invalid
   */
  constructor(options: EditorOptions) {
    validateEditorOptions(options);
    
    this.options = {
      snapToGrid: true,
      gridSize: 16,
      maxElements: 1000,
      maxConnections: 2000,
      enableKeyboardShortcuts: true,
      enableAutoSave: true,
      autoSaveInterval: 30000,
      ...options
    };
    
    this.renderer = new Renderer(options.canvas, options.connectionsSvg, {
      gridSize: this.options.gridSize,
      snapToGrid: this.options.snapToGrid,
      maxElements: this.options.maxElements,
      maxConnections: this.options.maxConnections
    });
    
    this.setupEventListeners();
    this.setupAutoSave();
    this.updateStatus('Editor ready', 'success');
  }

  /**
   * Add a new element to the canvas with validation
   * @param type - Block type identifier
   * @param x - X coordinate (optional, will be auto-generated if not provided)
   * @param y - Y coordinate (optional, will be auto-generated if not provided)
   * @param props - Element properties
   * @returns Element ID
   * @throws {Error} If element cannot be added
   */
  addElement(type: string, x?: number, y?: number, props: Record<string, unknown> = {}): string {
    this.checkDisposed();
    validateElementType(type);

    if (this.elements.size >= (this.options.maxElements ?? 1000)) {
      throw new Error(`Maximum number of elements reached (${this.options.maxElements})`);
    }

    if (!BlockRegistry.has(type)) {
      throw new Error(`Unknown block type: ${type}. Available types: ${BlockRegistry.getTypes().join(', ')}`);
    }

    const definition = BlockRegistry.get(type)!;
    const id = this.generateId();
    
    // Use provided coordinates or generate safe random ones
    const elementX = x ?? this.generateSafeX();
    const elementY = y ?? this.generateSafeY();
    
    validateCoordinates(elementX, elementY);
    
    // Merge and sanitize props
    const safeProps = sanitizeProps(props);
    const elementProps = { ...definition.defaultProps, ...safeProps };
    
    const elementData: ElementData = {
      id,
      type,
      x: elementX,
      y: elementY,
      props: elementProps
    };

    try {
      // Create DOM element and add to canvas
      const domElement = this.renderer.renderElement(elementData);
      this.options.canvas.appendChild(domElement);
      
      // Store references
      this.elements.set(id, elementData);
      this.domElements.set(id, domElement);
      
      this.options.onElementAdded?.(elementData);
      this.options.onCanvasChanged?.();
      this.updateStatus(`Added ${definition.displayName}`, 'success');
      
      return id;
    } catch (error) {
      throw new Error(
        `Failed to add element of type ${type}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Remove an element and its connections safely
   * @param elementId - ID of element to remove
   * @returns True if element was removed
   * @throws {TypeError} If elementId is invalid
   */
  removeElement(elementId: string): boolean {
    this.checkDisposed();
    
    if (typeof elementId !== 'string' || elementId.trim() === '') {
      throw new TypeError('Element ID must be a non-empty string');
    }

    const element = this.elements.get(elementId);
    const domElement = this.domElements.get(elementId);
    
    if (!element || !domElement) {
      return false;
    }

    try {
      // Remove all connections involving this element
      const connectionsToRemove: string[] = [];
      for (const [connectionId, connection] of this.connections) {
        if (connection.fromId === elementId || connection.toId === elementId) {
          connectionsToRemove.push(connectionId);
        }
      }
      
      for (const connectionId of connectionsToRemove) {
        this.removeConnection(connectionId);
      }
      
      // Clear selection if this element is selected
      if (this.dragState.selectedElement === domElement) {
        this.dragState.selectedElement = null;
        this.options.onSelectionChanged?.(null);
      }
      
      // Remove DOM element
      domElement.remove();
      
      // Remove from maps
      this.elements.delete(elementId);
      this.domElements.delete(elementId);
      
      this.options.onElementRemoved?.(elementId);
      this.options.onCanvasChanged?.();
      this.updateStatus('Element removed', 'success');
      
      return true;
    } catch (error) {
      this.updateStatus(
        `Failed to remove element: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
      return false;
    }
  }

  /**
   * Create connection between two elements with validation
   * @param fromId - Source element ID
   * @param toId - Target element ID
   * @returns Connection ID if successful, null otherwise
   */
  createConnection(fromId: string, toId: string): string | null {
    this.checkDisposed();
    
    if (typeof fromId !== 'string' || typeof toId !== 'string') {
      throw new TypeError('Element IDs must be strings');
    }

    if (fromId.trim() === '' || toId.trim() === '') {
      throw new TypeError('Element IDs cannot be empty');
    }

    if (fromId === toId) {
      this.updateStatus('Cannot connect element to itself', 'error');
      return null;
    }

    if (this.connections.size >= (this.options.maxConnections ?? 2000)) {
      this.updateStatus(`Maximum connections reached (${this.options.maxConnections})`, 'error');
      return null;
    }

    const connectionId = `${fromId}-${toId}`;
    if (this.connections.has(connectionId)) {
      this.updateStatus('Connection already exists', 'error');
      return null;
    }

    const fromElement = this.domElements.get(fromId);
    const toElement = this.domElements.get(toId);
    
    if (!fromElement || !toElement) {
      this.updateStatus('One or both elements not found', 'error');
      return null;
    }

    // Check for potential cycles (optional, can be expensive for large graphs)
    if (this.wouldCreateCycle(fromId, toId)) {
      this.updateStatus('Connection would create a cycle', 'error');
      return null;
    }

    try {
      const connection: ConnectionData = {
        id: connectionId,
        fromId,
        toId
      };

      // Render connection line
      const line = this.renderer.renderConnection(connection, fromElement, toElement);
      
      // Add click handler for deletion
      line.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeConnection(connectionId);
      }, { signal: this.eventAbortController?.signal });

      this.connections.set(connectionId, connection);
      this.options.onConnectionAdded?.(connection);
      this.options.onCanvasChanged?.();
      this.updateStatus('Connection created', 'success');
      
      return connectionId;
    } catch (error) {
      this.updateStatus(
        `Failed to create connection: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
      return null;
    }
  }

  /**
   * Remove a connection safely
   * @param connectionId - ID of connection to remove
   * @returns True if connection was removed
   */
  removeConnection(connectionId: string): boolean {
    this.checkDisposed();
    
    if (typeof connectionId !== 'string' || connectionId.trim() === '') {
      throw new TypeError('Connection ID must be a non-empty string');
    }

    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    try {
      this.renderer.removeConnection(connectionId);
      this.connections.delete(connectionId);
      
      this.options.onConnectionRemoved?.(connectionId);
      this.options.onCanvasChanged?.();
      this.updateStatus('Connection removed', 'success');
      
      return true;
    } catch (error) {
      this.updateStatus(
        `Failed to remove connection: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
      return false;
    }
  }

  /**
   * Toggle connection mode safely
   */
  toggleConnectMode(): void {
    this.checkDisposed();
    
    this.connectionState.connectMode = !this.connectionState.connectMode;
    this.options.canvas.classList.toggle('connect-mode', this.connectionState.connectMode);
    
    if (this.connectionState.connectMode) {
      this.updateStatus('Connect mode: click output → input', 'running');
    } else {
      this.clearConnectionSelection();
      this.updateStatus('Connect mode disabled', 'success');
    }
  }

  /**
   * Clear all elements and connections safely
   */
  clearAll(): void {
    this.checkDisposed();
    
    try {
      // Clear selections
      this.dragState.selectedElement = null;
      this.clearConnectionSelection();
      
      // Clear data structures
      this.elements.clear();
      this.domElements.clear();
      this.connections.clear();
      
      // Clear renderer
      this.renderer.clear();
      
      this.options.onCanvasChanged?.();
      this.updateStatus('Canvas cleared', 'success');
    } catch (error) {
      this.updateStatus(
        `Error clearing canvas: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
    }
  }

  /**
   * Execute the visual program with comprehensive error handling
   * @param options - Execution options
   */
  async executeProgram(options: Partial<ExecutionOptions> = {}): Promise<void> {
    this.checkDisposed();
    
    if (this.elements.size === 0) {
      this.updateStatus('Add some elements first!', 'error');
      return;
    }

    this.updateStatus('Executing program...', 'running');
    
    try {
      // Reset visual state of all elements
      for (const element of this.domElements.values()) {
        element.classList.remove('active', 'selected', 'error');
      }

      const executionOptions: ExecutionOptions = {
        stepDelay: 500,
        maxExecutionTime: 30000,
        maxSteps: 100,
        onElementStart: (elementId) => {
          const element = this.domElements.get(elementId);
          if (element) {
            element.classList.add('active');
          }
        },
        onElementComplete: (elementId) => {
          setTimeout(() => {
            const element = this.domElements.get(elementId);
            if (element) {
              element.classList.remove('active');
            }
          }, 300);
        },
        onConnectionTraversed: (connectionId) => {
          this.renderer.highlightConnection(connectionId, true);
          setTimeout(() => {
            this.renderer.highlightConnection(connectionId, false);
          }, 800);
        },
        onLog: (message) => {
          console.log('Execution:', message);
        },
        onError: (error, elementId) => {
          this.updateStatus(`Execution error: ${error.message}`, 'error');
          if (elementId) {
            const element = this.domElements.get(elementId);
            if (element) {
              element.classList.add('error');
              setTimeout(() => element.classList.remove('error'), 2000);
            }
          }
        },
        ...options
      };

      const executor = new ExecutionEngine(this.elements, this.connections);
      const result = await executor.execute(executionOptions);
      
      const executionTime = (result.endTime ?? Date.now()) - (result.startTime ?? Date.now());
      this.updateStatus(`Execution completed in ${executionTime}ms`, 'success');
      console.log('Execution result:', result);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateStatus(`Execution failed: ${errorMessage}`, 'error');
      console.error('Execution error:', error);
    }
  }

  /**
   * Get current editor state for serialization
   */
  getState(): { elements: ElementData[]; connections: ConnectionData[] } {
    this.checkDisposed();
    
    return {
      elements: Array.from(this.elements.values()),
      connections: Array.from(this.connections.values())
    };
  }

  /**
   * Load state from serialized data with validation
   * @param state - Serialized state data
   */
  loadState(state: { elements: ElementData[]; connections: ConnectionData[] }): void {
    this.checkDisposed();
    
    if (!state || typeof state !== 'object') {
      throw new TypeError('State must be an object');
    }
    
    if (!Array.isArray(state.elements) || !Array.isArray(state.connections)) {
      throw new TypeError('State must contain elements and connections arrays');
    }

    try {
      this.clearAll();

      // Validate and load elements
      for (const elementData of state.elements) {
        if (!this.isValidElementData(elementData)) {
          console.warn(`Skipping invalid element:`, elementData);
          continue;
        }
        
        if (!BlockRegistry.has(elementData.type)) {
          console.warn(`Skipping unknown block type: ${elementData.type}`);
          continue;
        }

        try {
          const domElement = this.renderer.renderElement(elementData);
          this.options.canvas.appendChild(domElement);
          
          this.elements.set(elementData.id, elementData);
          this.domElements.set(elementData.id, domElement);
        } catch (error) {
          console.warn(`Failed to load element ${elementData.id}:`, error);
        }
      }

      // Validate and load connections
      for (const connectionData of state.connections) {
        if (!this.isValidConnectionData(connectionData)) {
          console.warn(`Skipping invalid connection:`, connectionData);
          continue;
        }
        
        const fromElement = this.domElements.get(connectionData.fromId);
        const toElement = this.domElements.get(connectionData.toId);
        
        if (fromElement && toElement) {
          try {
            const line = this.renderer.renderConnection(connectionData, fromElement, toElement);
            line.addEventListener('click', (e) => {
              e.stopPropagation();
              this.removeConnection(connectionData.id);
            }, { signal: this.eventAbortController?.signal });
            
            this.connections.set(connectionData.id, connectionData);
          } catch (error) {
            console.warn(`Failed to load connection ${connectionData.id}:`, error);
          }
        }
      }

      this.options.onCanvasChanged?.();
      this.updateStatus(
        `Loaded ${this.elements.size} elements and ${this.connections.size} connections`, 
        'success'
      );
      
    } catch (error) {
      this.updateStatus(
        `Failed to load state: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
      throw error;
    }
  }

  /**
   * Get element and connection statistics
   */
  getStats(): EditorStats {
    this.checkDisposed();
    
    return {
      elementCount: this.elements.size,
      connectionCount: this.connections.size,
      selectedElement: this.dragState.selectedElement?.dataset.elementId ?? null,
      isConnectMode: this.connectionState.connectMode,
      isDragging: this.dragState.isDragging
    };
  }

  /**
   * Dispose of editor resources
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    try {
      // Clear auto-save timer
      if (this.autoSaveTimer) {
        clearInterval(this.autoSaveTimer);
      }

      // Abort all event listeners
      if (this.eventAbortController) {
        this.eventAbortController.abort();
      }

      // Clear all data
      this.clearAll();
      
      // Dispose renderer
      this.renderer.dispose();
      
      this.isDisposed = true;
    } catch (error) {
      console.error('Error during editor disposal:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Check if editor is disposed
   */
  private checkDisposed(): void {
    if (this.isDisposed) {
      throw new Error('Editor has been disposed');
    }
  }

  /**
   * Setup event listeners with proper cleanup
   */
  private setupEventListeners(): void {
    this.eventAbortController = new AbortController();
    const signal = this.eventAbortController.signal;

    // Canvas interaction events
    this.options.canvas.addEventListener('click', this.handleCanvasClick, { signal });
    this.options.canvas.addEventListener('mousedown', this.handleMouseDown, { signal });
    
    // Global mouse events for dragging
    document.addEventListener('mousemove', this.handleMouseMove, { signal });
    document.addEventListener('mouseup', this.handleMouseUp, { signal });
    
    // Keyboard shortcuts
    if (this.options.enableKeyboardShortcuts) {
      document.addEventListener('keydown', this.handleKeyDown, { signal });
    }

    // Prevent context menu on canvas
    this.options.canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
  }

  /**
   * Setup auto-save functionality
   */
  private setupAutoSave(): void {
    if (!this.options.enableAutoSave) {
      return;
    }

    const interval = this.options.autoSaveInterval ?? 30000;
    this.autoSaveTimer = window.setInterval(() => {
      try {
        const state = this.getState();
        localStorage.setItem('visual-programming-autosave', JSON.stringify(state));
      } catch (error) {
        console.warn('Auto-save failed:', error);
      }
    }, interval);
  }

  /**
   * Handle canvas clicks for connection mode
   */
  private readonly handleCanvasClick = (e: MouseEvent): void => {
    if (!this.connectionState.connectMode) return;

    const connectionPoint = (e.target as Element).closest('.connection-point') as HTMLElement;
    if (!connectionPoint) {
      this.clearConnectionSelection();
      return;
    }

    const element = connectionPoint.closest('.element') as HTMLElement;
    if (!element || !element.dataset.elementId) return;

    const elementId = element.dataset.elementId;
    const isOutput = connectionPoint.classList.contains('output-point');

    if (isOutput && !this.connectionState.selectedOutput) {
      // Select output
      this.connectionState.selectedOutput = { elementId, element: connectionPoint };
      connectionPoint.classList.add('selected');
      this.updateStatus('Select an input point to connect', 'running');
    } else if (!isOutput && this.connectionState.selectedOutput) {
      // Connect to input
      this.createConnection(this.connectionState.selectedOutput.elementId, elementId);
      this.clearConnectionSelection();
    }
  };

  /**
   * Handle mouse down for dragging
   */
  private readonly handleMouseDown = (e: MouseEvent): void => {
    if (this.connectionState.connectMode || (e.target as Element).closest('.connection-point')) {
      return;
    }

    const element = (e.target as Element).closest('.element') as HTMLElement;
    if (!element) return;

    this.dragState.isDragging = true;
    this.dragState.selectedElement = element;
    
    const rect = element.getBoundingClientRect();
    this.dragState.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    this.dragState.startPosition = {
      x: e.clientX,
      y: e.clientY
    };
    
    element.style.zIndex = '1000';
    this.options.onSelectionChanged?.(element.dataset.elementId ?? null);
    e.preventDefault();
  };

  /**
   * Handle mouse move for dragging
   */
  private readonly handleMouseMove = (e: MouseEvent): void => {
    if (!this.dragState.isDragging || !this.dragState.selectedElement) {
      return;
    }
    
    const x = Math.max(0, e.clientX - this.dragState.dragOffset.x);
    const y = Math.max(0, e.clientY - this.dragState.dragOffset.y);
    
    this.renderer.updateElementPosition(
      this.dragState.selectedElement, 
      x, 
      y, 
      this.options.snapToGrid
    );
    
    // Update element data
    const elementId = this.dragState.selectedElement.dataset.elementId;
    if (elementId) {
      const elementData = this.elements.get(elementId);
      if (elementData) {
        elementData.x = x;
        elementData.y = y;
        this.renderer.updateElementConnections(elementId, this.connections, this.domElements);
      }
    }
  };

  /**
   * Handle mouse up to end dragging
   */
  private readonly handleMouseUp = (): void => {
    if (!this.dragState.isDragging) {
      return;
    }

    if (this.dragState.selectedElement) {
      this.dragState.selectedElement.style.zIndex = '';
    }
    
    const wasDragging = this.dragState.isDragging;
    this.dragState.isDragging = false;
    this.dragState.selectedElement = null;
    
    if (wasDragging) {
      this.options.onCanvasChanged?.();
    }
  };

  /**
   * Handle keyboard shortcuts
   */
  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      if (this.connectionState.connectMode) {
        this.toggleConnectMode();
      }
      this.clearConnectionSelection();
    }
    
    if (e.key === 'Delete' && this.dragState.selectedElement) {
      const elementId = this.dragState.selectedElement.dataset.elementId;
      if (elementId) {
        this.removeElement(elementId);
      }
    }
  };

  /**
   * Clear connection selection state
   */
  private clearConnectionSelection(): void {
    if (this.connectionState.selectedOutput) {
      this.connectionState.selectedOutput.element.classList.remove('selected');
      this.connectionState.selectedOutput = null;
    }
  }

  /**
   * Generate unique element ID
   */
  private generateId(): string {
    return `element-${++this.idCounter}-${Date.now()}`;
  }

  /**
   * Generate safe random X coordinate
   */
  private generateSafeX(): number {
    const canvasWidth = this.options.canvas.clientWidth || 800;
    return Math.random() * Math.max(200, canvasWidth - 400) + 100;
  }

  /**
   * Generate safe random Y coordinate
   */
  private generateSafeY(): number {
    const canvasHeight = this.options.canvas.clientHeight || 600;
    return Math.random() * Math.max(200, canvasHeight - 300) + 100;
  }

  /**
   * Check if adding connection would create a cycle
   */
  private wouldCreateCycle(fromId: string, toId: string): boolean {
    // Simple cycle detection - check if toId can reach fromId
    const visited = new Set<string>();
    const stack = [toId];
    
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      
      if (currentId === fromId) {
        return true; // Cycle detected
      }
      
      if (visited.has(currentId)) {
        continue;
      }
      
      visited.add(currentId);
      
      // Add all elements this one connects to
      for (const connection of this.connections.values()) {
        if (connection.fromId === currentId) {
          stack.push(connection.toId);
        }
      }
    }
    
    return false;
  }

  /**
   * Validate element data structure
   */
  private isValidElementData(data: unknown): data is ElementData {
    return !!(
      data &&
      typeof data === 'object' &&
      'id' in data &&
      'type' in data &&
      'x' in data &&
      'y' in data &&
      'props' in data &&
      typeof (data as any).id === 'string' &&
      typeof (data as any).type === 'string' &&
      typeof (data as any).x === 'number' &&
      typeof (data as any).y === 'number' &&
      typeof (data as any).props === 'object'
    );
  }

  /**
   * Validate connection data structure
   */
  private isValidConnectionData(data: unknown): data is ConnectionData {
    return !!(
      data &&
      typeof data === 'object' &&
      'id' in data &&
      'fromId' in data &&
      'toId' in data &&
      typeof (data as any).id === 'string' &&
      typeof (data as any).fromId === 'string' &&
      typeof (data as any).toId === 'string'
    );
  }

  /**
   * Update status message safely
   */
  private updateStatus(message: string, type?: 'success' | 'error' | 'running'): void {
    try {
      this.options.onStatusUpdate?.(message, type);
    } catch (error) {
      console.warn('Failed to update status:', error);
    }
  }
}