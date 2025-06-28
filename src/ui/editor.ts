/**
 * Editor - Handles drag & drop, connections, user interactions, and inline editing
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
  readonly enableInlineEditing?: boolean;
  readonly onElementAdded?: (element: ElementData) => void;
  readonly onElementRemoved?: (elementId: string) => void;
  readonly onConnectionAdded?: (connection: ConnectionData) => void;
  readonly onConnectionRemoved?: (connectionId: string) => void;
  readonly onStatusUpdate?: (message: string, type?: 'success' | 'error' | 'running') => void;
  readonly onSelectionChanged?: (elementId: string | null) => void;
  readonly onCanvasChanged?: () => void;
  readonly onPropertyChanged?: (elementId: string, property: string, value: unknown) => void;
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
 * with comprehensive error handling and inline editing capabilities
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
  private currentEditingElement?: HTMLElement;

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
      enableInlineEditing: true,
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
  // Inline Editing Methods
  // ---------------------------------------------------------------------------

  /**
   * Open inline editor for an element
   */
  private openElementEditor(element: HTMLElement): void {
    if (!this.options.enableInlineEditing) return;
    
    const elementId = element.dataset.elementId;
    if (!elementId) return;

    const elementData = this.elements.get(elementId);
    if (!elementData) return;

    const definition = BlockRegistry.get(elementData.type);
    if (!definition) return;

    this.currentEditingElement = element;
    this.showInlineEditor(element, elementData, definition);
  }

  /**
   * Show inline editor overlay
   */
  private showInlineEditor(element: HTMLElement, elementData: ElementData, definition: any): void {
    // Remove any existing editor
    this.hideInlineEditor();

    const rect = element.getBoundingClientRect();
    const editor = document.createElement('div');
    editor.className = 'inline-element-editor';
    editor.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.bottom + 5}px;
      background: var(--bg-card, rgba(15, 15, 25, 0.95));
      border: 2px solid var(--primary-blue, #00d4ff);
      border-radius: 8px;
      padding: 12px;
      z-index: 1000;
      min-width: 200px;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    `;

    // Create form for editing properties
    const form = document.createElement('form');
    form.innerHTML = `
      <div style="font-size: 12px; font-weight: 600; color: var(--primary-blue, #00d4ff); margin-bottom: 8px;">
        Edit ${definition.displayName}
      </div>
    `;

    // Add input fields for editable properties
    const editableProps = this.getEditableProperties(definition, elementData);
    
    for (const [key, propInfo] of Object.entries(editableProps)) {
      const fieldContainer = document.createElement('div');
      fieldContainer.style.marginBottom = '8px';

      const label = document.createElement('label');
      label.textContent = propInfo.label;
      label.style.cssText = `
        display: block;
        font-size: 11px;
        color: var(--text-secondary, #a1a1aa);
        margin-bottom: 2px;
      `;

      const input = this.createInputForProperty(key, propInfo, elementData.props[key]);
      input.style.cssText = `
        width: 100%;
        padding: 4px 8px;
        border: 1px solid var(--border-glass, rgba(255, 255, 255, 0.1));
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-primary, #ffffff);
        font-size: 12px;
      `;

      fieldContainer.appendChild(label);
      fieldContainer.appendChild(input);
      form.appendChild(fieldContainer);
    }

    // Add buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 8px;
      margin-top: 12px;
    `;

    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.type = 'submit';
    saveButton.style.cssText = `
      background: var(--accent-green, #10b981);
      color: #000;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      flex: 1;
    `;

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.type = 'button';
    cancelButton.style.cssText = `
      background: var(--accent-red, #ef4444);
      color: #fff;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      flex: 1;
    `;

    buttonContainer.appendChild(saveButton);
    buttonContainer.appendChild(cancelButton);
    form.appendChild(buttonContainer);

    // Handle form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveElementChanges(elementData, form);
    });

    cancelButton.addEventListener('click', () => {
      this.hideInlineEditor();
    });

    editor.appendChild(form);
    document.body.appendChild(editor);

    // Focus first input
    const firstInput = form.querySelector('input, select, textarea') as HTMLElement;
    firstInput?.focus();
  }

  /**
   * Get editable properties for a block type
   */
  private getEditableProperties(definition: any, elementData: ElementData): Record<string, any> {
    const props: Record<string, any> = {};

    // Common editable properties based on block type
    switch (elementData.type) {
      case 'variable':
        props.name = { label: 'Variable Name', type: 'text' };
        props.value = { label: 'Initial Value', type: 'text' };
        break;
      
      case 'set_variable':
        props.name = { label: 'Variable Name', type: 'text' };
        break;
        
      case 'get_variable':
        props.name = { label: 'Variable Name', type: 'text' };
        break;
      
      case 'array':
        props.items = { label: 'Items (JSON)', type: 'textarea' };
        break;
        
      case 'array_get':
      case 'array_set':
        props.index = { label: 'Index', type: 'number' };
        break;
        
      case 'object_get':
      case 'object_set':
        props.key = { label: 'Property Key', type: 'text' };
        break;
        
      case 'counter':
        props.value = { label: 'Initial Value', type: 'number' };
        props.step = { label: 'Step', type: 'number' };
        break;
        
      case 'counter_increment':
        props.step = { label: 'Step', type: 'number' };
        props.initialValue = { label: 'Initial Value', type: 'number' };
        break;
        
      case 'counter_reset':
        props.value = { label: 'Reset Value', type: 'number' };
        break;
        
      case 'function':
        props.name = { label: 'Function Name', type: 'text' };
        props.params = { label: 'Parameters', type: 'text' };
        break;
        
      case 'loop':
        props.count = { label: 'Loop Count', type: 'number' };
        break;
        
      case 'while_loop':
        props.maxIterations = { label: 'Max Iterations', type: 'number' };
        break;
        
      case 'for_range':
        props.start = { label: 'Start', type: 'number' };
        props.end = { label: 'End', type: 'number' };
        props.step = { label: 'Step', type: 'number' };
        break;
        
      case 'add':
      case 'multiply':
        props.a = { label: 'First Value', type: 'number' };
        props.b = { label: 'Second Value', type: 'number' };
        break;
        
      case 'print':
        props.message = { label: 'Message', type: 'text' };
        break;
        
      case 'if':
        props.condition = { label: 'Condition', type: 'text' };
        break;
        
      case 'string_concat':
        props.separator = { label: 'Separator', type: 'text' };
        break;
        
      case 'comment':
        props.text = { label: 'Comment Text', type: 'textarea' };
        break;
        
      default:
        // Generic handling for custom blocks
        if (definition.defaultProps) {
          for (const [key, value] of Object.entries(definition.defaultProps)) {
            if (typeof value === 'string') {
              props[key] = { label: this.formatLabel(key), type: 'text' };
            } else if (typeof value === 'number') {
              props[key] = { label: this.formatLabel(key), type: 'number' };
            } else if (typeof value === 'boolean') {
              props[key] = { label: this.formatLabel(key), type: 'checkbox' };
            }
          }
        }
    }

    return props;
  }

  /**
   * Create appropriate input element for property type
   */
  private createInputForProperty(key: string, propInfo: any, currentValue: unknown): HTMLElement {
    switch (propInfo.type) {
      case 'number':
        const numberInput = document.createElement('input');
        numberInput.type = 'number';
        numberInput.name = key;
        numberInput.value = String(currentValue ?? '');
        return numberInput;
        
      case 'checkbox':
        const checkboxInput = document.createElement('input');
        checkboxInput.type = 'checkbox';
        checkboxInput.name = key;
        checkboxInput.checked = Boolean(currentValue);
        return checkboxInput;
        
      case 'textarea':
        const textarea = document.createElement('textarea');
        textarea.name = key;
        textarea.rows = 3;
        if (Array.isArray(currentValue)) {
          textarea.value = JSON.stringify(currentValue, null, 2);
        } else {
          textarea.value = String(currentValue ?? '');
        }
        return textarea;
        
      case 'select':
        const select = document.createElement('select');
        select.name = key;
        // Add options based on propInfo.options if available
        if (propInfo.options) {
          for (const option of propInfo.options) {
            const optionEl = document.createElement('option');
            optionEl.value = option.value;
            optionEl.textContent = option.label;
            optionEl.selected = option.value === currentValue;
            select.appendChild(optionEl);
          }
        }
        return select;
        
      default: // text
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.name = key;
        textInput.value = String(currentValue ?? '');
        return textInput;
    }
  }

  /**
   * Save changes made in the inline editor
   */
  private saveElementChanges(elementData: ElementData, form: HTMLFormElement): void {
    const formData = new FormData(form);
    const updatedProps: Record<string, unknown> = { ...elementData.props };

    for (const [key, value] of formData.entries()) {
      const input = form.querySelector(`[name="${key}"]`) as HTMLInputElement;
      
      if (input.type === 'number') {
        updatedProps[key] = parseFloat(value as string) || 0;
      } else if (input.type === 'checkbox') {
        updatedProps[key] = (input as HTMLInputElement).checked;
      } else if (input.tagName === 'TEXTAREA' && key === 'items') {
        // Special handling for array items
        try {
          updatedProps[key] = JSON.parse(value as string);
        } catch {
          updatedProps[key] = value.toString().split(',').map(s => s.trim());
        }
      } else {
        updatedProps[key] = value;
      }
    }

    // Update element data
    elementData.props = updatedProps;

    // Re-render the element
    this.rerenderElement(elementData);

    // Notify about property changes
    for (const [key, value] of Object.entries(updatedProps)) {
      this.options.onPropertyChanged?.(elementData.id, key, value);
    }

    this.hideInlineEditor();
  }

  /**
   * Re-render an element with updated properties
   */
  private rerenderElement(elementData: ElementData): void {
    const element = document.querySelector(`[data-element-id="${elementData.id}"]`) as HTMLElement;
    if (!element) return;

    const definition = BlockRegistry.get(elementData.type);
    if (!definition || !definition.render) return;

    try {
      const rendered = definition.render(elementData.props);
      
      // Update label
      const labelEl = element.querySelector('.element-label');
      if (labelEl) {
        labelEl.textContent = rendered.label;
      }

      // Update content
      const contentEl = element.querySelector('.element-content');
      if (contentEl) {
        contentEl.textContent = rendered.content;
      }

      // Update value if present
      const valueEl = element.querySelector('.element-value');
      if (valueEl && rendered.value !== undefined) {
        valueEl.textContent = rendered.value;
      }

      // Special handling for array elements
      if (elementData.type === 'array' && Array.isArray(elementData.props.items)) {
        this.rerenderArrayContent(contentEl as HTMLElement, elementData.props.items as unknown[]);
      }
    } catch (error) {
      console.warn('Failed to re-render element:', error);
    }
  }

  /**
   * Re-render array content specifically
   */
  private rerenderArrayContent(container: HTMLElement, items: unknown[]): void {
    if (!container) return;

    container.innerHTML = '';
    container.className = 'element-content array-container';

    const openBracket = document.createElement('span');
    openBracket.className = 'array-bracket';
    openBracket.textContent = '[';
    container.appendChild(openBracket);

    const maxVisible = Math.min(5, items.length);
    const visibleItems = items.slice(0, maxVisible);

    for (const item of visibleItems) {
      const itemEl = document.createElement('div');
      itemEl.className = 'array-item';
      const itemStr = String(item);
      itemEl.textContent = itemStr.slice(0, 2);
      itemEl.title = itemStr.slice(0, 100);
      container.appendChild(itemEl);
    }

    if (items.length > maxVisible) {
      const moreEl = document.createElement('div');
      moreEl.className = 'array-item';
      moreEl.textContent = '...';
      moreEl.title = `${items.length - maxVisible} more items`;
      container.appendChild(moreEl);
    }

    const closeBracket = document.createElement('span');
    closeBracket.className = 'array-bracket';
    closeBracket.textContent = ']';
    container.appendChild(closeBracket);
  }

  /**
   * Show context menu for element
   */
  private showContextMenu(element: HTMLElement, x: number, y: number): void {
    this.hideContextMenu();

    const menu = document.createElement('div');
    menu.className = 'element-context-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      background: var(--bg-card, rgba(15, 15, 25, 0.95));
      border: 1px solid var(--border-glass, rgba(255, 255, 255, 0.1));
      border-radius: 6px;
      padding: 4px 0;
      z-index: 2000;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      min-width: 120px;
    `;

    const menuItems = [
      { label: 'Edit Properties', action: () => this.openElementEditor(element) },
      { label: 'Duplicate', action: () => this.duplicateElement(element) },
      { label: 'Delete', action: () => this.deleteElement(element) },
    ];

    for (const item of menuItems) {
      const menuItem = document.createElement('div');
      menuItem.textContent = item.label;
      menuItem.style.cssText = `
        padding: 6px 12px;
        cursor: pointer;
        font-size: 12px;
        color: var(--text-primary, #ffffff);
        transition: background 0.1s ease;
      `;

      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.background = 'rgba(255, 255, 255, 0.1)';
      });

      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.background = 'transparent';
      });

      menuItem.addEventListener('click', () => {
        item.action();
        this.hideContextMenu();
      });

      menu.appendChild(menuItem);
    }

    document.body.appendChild(menu);
  }

  /**
   * Hide context menu
   */
  private hideContextMenu(): void {
    const menu = document.querySelector('.element-context-menu');
    if (menu) {
      menu.remove();
    }
  }

  /**
   * Hide inline editor
   */
  private hideInlineEditor(): void {
    const editor = document.querySelector('.inline-element-editor');
    if (editor) {
      editor.remove();
    }
    this.currentEditingElement = undefined;
  }

  /**
   * Duplicate an element
   */
  private duplicateElement(element: HTMLElement): void {
    const elementId = element.dataset.elementId;
    if (!elementId) return;

    const elementData = this.elements.get(elementId);
    if (!elementData) return;

    // Add duplicated element with slight offset
    try {
      this.addElement(
        elementData.type,
        elementData.x + 20,
        elementData.y + 20,
        { ...elementData.props }
      );
    } catch (error) {
      console.warn('Failed to duplicate element:', error);
    }
  }

  /**
   * Delete an element
   */
  private deleteElement(element: HTMLElement): void {
    const elementId = element.dataset.elementId;
    if (!elementId) return;

    if (confirm('Delete this element and all its connections?')) {
      this.removeElement(elementId);
    }
  }

  /**
   * Format property name for display
   */
  private formatLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
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
    
    // Double-click editing
    if (this.options.enableInlineEditing) {
      this.options.canvas.addEventListener('dblclick', (e) => {
        const element = (e.target as Element).closest('.element') as HTMLElement;
        if (!element || !element.dataset.elementId) return;

        e.preventDefault();
        this.openElementEditor(element);
      }, { signal });

      // Context menu
      this.options.canvas.addEventListener('contextmenu', (e) => {
        const element = (e.target as Element).closest('.element') as HTMLElement;
        if (!element || !element.dataset.elementId) return;

        e.preventDefault();
        this.showContextMenu(element, e.clientX, e.clientY);
      }, { signal });

      // Hide context menu on click elsewhere
      document.addEventListener('click', () => {
        this.hideContextMenu();
      }, { signal });
    }
    
    // Global mouse events for dragging
    document.addEventListener('mousemove', this.handleMouseMove, { signal });
    document.addEventListener('mouseup', this.handleMouseUp, { signal });
    
    // Keyboard shortcuts
    if (this.options.enableKeyboardShortcuts) {
      document.addEventListener('keydown', this.handleKeyDown, { signal });
    }

    // Prevent context menu on canvas (if inline editing disabled)
    if (!this.options.enableInlineEditing) {
      this.options.canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    }
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
      this.hideInlineEditor();
      this.hideContextMenu();
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