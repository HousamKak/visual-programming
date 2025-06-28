/**
 * Editor - Handles drag & drop, connections, and user interactions
 * Main UI logic for the visual programming interface
 */

import { Renderer, type ElementData, type ConnectionData } from '../core/renderer.js';
import { BlockRegistry } from '../core/registry';
import { ExecutionEngine, type ExecutionOptions } from '../core/executor.js';

export interface EditorOptions {
  readonly canvas: HTMLElement;
  readonly connectionsSvg: SVGElement;
  readonly snapToGrid?: boolean;
  readonly gridSize?: number;
  readonly onElementAdded?: (element: ElementData) => void;
  readonly onElementRemoved?: (elementId: string) => void;
  readonly onConnectionAdded?: (connection: ConnectionData) => void;
  readonly onConnectionRemoved?: (connectionId: string) => void;
  readonly onStatusUpdate?: (message: string, type?: 'success' | 'error' | 'running') => void;
}

export class Editor {
  private readonly renderer: Renderer;
  private readonly options: EditorOptions;
  
  private readonly elements = new Map<string, ElementData>();
  private readonly domElements = new Map<string, HTMLElement>();
  private readonly connections = new Map<string, ConnectionData>();
  
  private idCounter = 0;
  private connectMode = false;
  private selectedOutput: { elementId: string; element: HTMLElement } | null = null;
  
  // Drag state
  private isDragging = false;
  private selectedElement: HTMLElement | null = null;
  private dragOffset = { x: 0, y: 0 };
  
  constructor(options: EditorOptions) {
    if (!options.canvas || !options.connectionsSvg) {
      throw new TypeError('Canvas and connections SVG are required');
    }
    
    this.options = options;
    this.renderer = new Renderer(options.canvas, options.connectionsSvg);
    
    this.setupEventListeners();
    this.updateStatus('Editor ready', 'success');
  }

  /**
   * Add a new element to the canvas
   */
  addElement(type: string, x?: number, y?: number, props: Record<string, unknown> = {}): string {
    if (!type || typeof type !== 'string') {
      throw new TypeError('Element type must be a non-empty string');
    }

    if (!BlockRegistry.has(type)) {
      throw new Error(`Unknown block type: ${type}`);
    }

    const definition = BlockRegistry.get(type)!;
    const id = this.generateId();
    
    // Use provided coordinates or generate random ones
    const elementX = x ?? Math.random() * (window.innerWidth - 400) + 200;
    const elementY = y ?? Math.random() * (window.innerHeight - 300) + 150;
    
    // Merge default props with provided props
    const elementProps = { ...definition.defaultProps, ...props };
    
    const elementData: ElementData = {
      id,
      type,
      x: elementX,
      y: elementY,
      props: elementProps
    };

    // Create DOM element and add to canvas
    const domElement = this.renderer.renderElement(elementData);
    this.options.canvas.appendChild(domElement);
    
    // Store references
    this.elements.set(id, elementData);
    this.domElements.set(id, domElement);
    
    this.options.onElementAdded?.(elementData);
    this.updateStatus(`Added ${definition.displayName}`, 'success');
    
    return id;
  }

  /**
   * Remove an element and its connections
   */
  removeElement(elementId: string): boolean {
    if (typeof elementId !== 'string') {
      throw new TypeError('Element ID must be a string');
    }

    const element = this.elements.get(elementId);
    const domElement = this.domElements.get(elementId);
    
    if (!element || !domElement) {
      return false;
    }

    // Remove all connections involving this element
    const connectionsToRemove: string[] = [];
    this.connections.forEach((connection, id) => {
      if (connection.fromId === elementId || connection.toId === elementId) {
        connectionsToRemove.push(id);
      }
    });
    
    connectionsToRemove.forEach(id => this.removeConnection(id));
    
    // Remove DOM element
    domElement.remove();
    
    // Remove from maps
    this.elements.delete(elementId);
    this.domElements.delete(elementId);
    
    this.options.onElementRemoved?.(elementId);
    this.updateStatus('Element removed', 'error');
    
    return true;
  }

  /**
   * Create connection between two elements
   */
  createConnection(fromId: string, toId: string): string | null {
    if (typeof fromId !== 'string' || typeof toId !== 'string') {
      throw new TypeError('Element IDs must be strings');
    }

    if (fromId === toId) {
      this.updateStatus('Cannot connect element to itself', 'error');
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
      this.updateStatus('Elements not found', 'error');
      return null;
    }

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
    });

    this.connections.set(connectionId, connection);
    this.options.onConnectionAdded?.(connection);
    this.updateStatus('Connection created', 'success');
    
    return connectionId;
  }

  /**
   * Remove a connection
   */
  removeConnection(connectionId: string): boolean {
    if (typeof connectionId !== 'string') {
      throw new TypeError('Connection ID must be a string');
    }

    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    this.renderer.removeConnection(connectionId);
    this.connections.delete(connectionId);
    
    this.options.onConnectionRemoved?.(connectionId);
    this.updateStatus('Connection removed', 'error');
    
    return true;
  }

  /**
   * Toggle connection mode
   */
  toggleConnectMode(): void {
    this.connectMode = !this.connectMode;
    this.options.canvas.classList.toggle('connect-mode', this.connectMode);
    
    if (this.connectMode) {
      this.updateStatus('Connect mode: click output → input', 'running');
    } else {
      this.clearConnectionSelection();
      this.updateStatus('Connect mode disabled', 'success');
    }
  }

  /**
   * Clear all elements and connections
   */
  clearAll(): void {
    this.elements.clear();
    this.domElements.clear();
    this.connections.clear();
    this.renderer.clear();
    this.clearConnectionSelection();
    
    this.updateStatus('Canvas cleared', 'error');
  }

  /**
   * Execute the visual program
   */
  async executeProgram(options: Partial<ExecutionOptions> = {}): Promise<void> {
    if (this.elements.size === 0) {
      this.updateStatus('Add some elements first!', 'error');
      return;
    }

    this.updateStatus('Executing program...', 'running');
    
    // Reset all elements
    this.domElements.forEach(element => {
      element.classList.remove('active', 'selected');
    });

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

    try {
      const executor = new ExecutionEngine(this.elements, this.connections);
      const result = await executor.execute(executionOptions);
      
      this.updateStatus(`Execution completed in ${result.endTime! - result.startTime!}ms`, 'success');
      console.log('Execution result:', result);
      
    } catch (error) {
      this.updateStatus(`Execution failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  /**
   * Get current editor state for serialization
   */
  getState(): { elements: ElementData[]; connections: ConnectionData[] } {
    return {
      elements: Array.from(this.elements.values()),
      connections: Array.from(this.connections.values())
    };
  }

  /**
   * Load state from serialized data
   */
  loadState(state: { elements: ElementData[]; connections: ConnectionData[] }): void {
    if (!state || !Array.isArray(state.elements) || !Array.isArray(state.connections)) {
      throw new TypeError('Invalid state format');
    }

    this.clearAll();

    // Load elements
    state.elements.forEach(elementData => {
      if (!BlockRegistry.has(elementData.type)) {
        console.warn(`Skipping unknown block type: ${elementData.type}`);
        return;
      }

      const domElement = this.renderer.renderElement(elementData);
      this.options.canvas.appendChild(domElement);
      
      this.elements.set(elementData.id, elementData);
      this.domElements.set(elementData.id, domElement);
    });

    // Load connections
    state.connections.forEach(connectionData => {
      const fromElement = this.domElements.get(connectionData.fromId);
      const toElement = this.domElements.get(connectionData.toId);
      
      if (fromElement && toElement) {
        const line = this.renderer.renderConnection(connectionData, fromElement, toElement);
        line.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeConnection(connectionData.id);
        });
        
        this.connections.set(connectionData.id, connectionData);
      }
    });

    this.updateStatus(`Loaded ${state.elements.length} elements and ${state.connections.length} connections`, 'success');
  }

  /**
   * Get element and connection counts
   */
  getStats(): { elementCount: number; connectionCount: number } {
    return {
      elementCount: this.elements.size,
      connectionCount: this.connections.size
    };
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Canvas click handling
    this.options.canvas.addEventListener('click', this.handleCanvasClick);
    this.options.canvas.addEventListener('mousedown', this.handleMouseDown);
    
    // Global mouse events for dragging
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Handle canvas clicks
   */
  private readonly handleCanvasClick = (e: MouseEvent): void => {
    if (!this.connectMode) return;

    const connectionPoint = (e.target as Element).closest('.connection-point') as HTMLElement;
    if (!connectionPoint) return;

    const element = connectionPoint.closest('.element') as HTMLElement;
    if (!element) return;

    const elementId = element.dataset.elementId!;
    const isOutput = connectionPoint.classList.contains('output-point');

    if (isOutput && !this.selectedOutput) {
      // Select output
      this.selectedOutput = { elementId, element: connectionPoint };
      connectionPoint.classList.add('selected');
      this.updateStatus('Select an input point to connect', 'running');
    } else if (!isOutput && this.selectedOutput) {
      // Connect to input
      this.createConnection(this.selectedOutput.elementId, elementId);
      this.clearConnectionSelection();
    }
  };

  /**
   * Handle mouse down for dragging
   */
  private readonly handleMouseDown = (e: MouseEvent): void => {
    if (this.connectMode || (e.target as Element).closest('.connection-point')) return;

    const element = (e.target as Element).closest('.element') as HTMLElement;
    if (!element) return;

    this.isDragging = true;
    this.selectedElement = element;
    
    const rect = element.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    element.style.zIndex = '1000';
    e.preventDefault();
  };

  /**
   * Handle mouse move for dragging
   */
  private readonly handleMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging || !this.selectedElement) return;
    
    const x = Math.max(0, e.clientX - this.dragOffset.x);
    const y = Math.max(0, e.clientY - this.dragOffset.y);
    
    this.renderer.updateElementPosition(this.selectedElement, x, y, this.options.snapToGrid);
    
    // Update element data
    const elementId = this.selectedElement.dataset.elementId!;
    const elementData = this.elements.get(elementId);
    if (elementData) {
      elementData.x = x;
      elementData.y = y;
      this.renderer.updateElementConnections(elementId, this.connections, this.domElements);
    }
  };

  /**
   * Handle mouse up to end dragging
   */
  private readonly handleMouseUp = (): void => {
    if (this.selectedElement) {
      this.selectedElement.style.zIndex = '';
    }
    
    this.isDragging = false;
    this.selectedElement = null;
  };

  /**
   * Handle keyboard shortcuts
   */
  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      if (this.connectMode) {
        this.toggleConnectMode();
      }
      this.clearConnectionSelection();
    }
    
    if (e.key === 'Delete' && this.selectedElement) {
      const elementId = this.selectedElement.dataset.elementId!;
      this.removeElement(elementId);
    }
  };

  /**
   * Clear connection selection
   */
  private clearConnectionSelection(): void {
    if (this.selectedOutput) {
      this.selectedOutput.element.classList.remove('selected');
      this.selectedOutput = null;
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `element-${++this.idCounter}`;
  }

  /**
   * Update status message
   */
  private updateStatus(message: string, type?: 'success' | 'error' | 'running'): void {
    this.options.onStatusUpdate?.(message, type);
  }
}