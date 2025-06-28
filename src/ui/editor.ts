/**
 * Enhanced Editor with Panning Support
 * Adds smooth canvas panning functionality for better navigation
 */

import { Renderer, type ElementData, type ConnectionData } from '../core/renderer.js';
import { BlockRegistry } from '../core/registry.js';
import { ExecutionEngine, type ExecutionOptions } from '../core/executor.js';

// ---------------------------------------------------------------------------
// Enhanced Editor with Panning
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
  readonly enablePanning?: boolean;
  readonly panButton?: 'middle' | 'right' | 'space';
  readonly onElementAdded?: (element: ElementData) => void;
  readonly onElementRemoved?: (elementId: string) => void;
  readonly onConnectionAdded?: (connection: ConnectionData) => void;
  readonly onConnectionRemoved?: (connectionId: string) => void;
  readonly onStatusUpdate?: (message: string, type?: 'success' | 'error' | 'running') => void;
  readonly onSelectionChanged?: (elementId: string | null) => void;
  readonly onCanvasChanged?: () => void;
  readonly onPropertyChanged?: (elementId: string, property: string, value: unknown) => void;
  readonly onPanChanged?: (panX: number, panY: number) => void;
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

interface PanState {
  isPanning: boolean;
  panOffset: { x: number; y: number };
  panStart: { x: number; y: number };
  lastPanOffset: { x: number; y: number };
  spaceKeyDown: boolean;
}

interface EditorStats {
  readonly elementCount: number;
  readonly connectionCount: number;
  readonly selectedElement: string | null;
  readonly isConnectMode: boolean;
  readonly isDragging: boolean;
  readonly isPanning: boolean;
  readonly panOffset: { x: number; y: number };
}

/**
 * Enhanced Editor with comprehensive panning support
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

  private readonly panState: PanState = {
    isPanning: false,
    panOffset: { x: 0, y: 0 },
    panStart: { x: 0, y: 0 },
    lastPanOffset: { x: 0, y: 0 },
    spaceKeyDown: false
  };

  private autoSaveTimer?: number;
  private isDisposed = false;
  private eventAbortController?: AbortController;
  private currentEditingElement?: HTMLElement;
  private panContainer?: HTMLElement;

  constructor(options: EditorOptions) {
    this.options = {
      snapToGrid: true,
      gridSize: 16,
      maxElements: 1000,
      maxConnections: 2000,
      enableKeyboardShortcuts: true,
      enableAutoSave: true,
      enableInlineEditing: true,
      enablePanning: true,
      panButton: 'middle',
      autoSaveInterval: 30000,
      ...options
    };
    
    this.renderer = new Renderer(options.canvas, options.connectionsSvg, {
      gridSize: this.options.gridSize,
      snapToGrid: this.options.snapToGrid,
      maxElements: this.options.maxElements,
      maxConnections: this.options.maxConnections
    });
    
    this.setupPanContainer();
    this.setupEventListeners();
    this.setupAutoSave();
    this.updateStatus('Editor ready - Middle click + drag to pan', 'success');
  }

  // ---------------------------------------------------------------------------
  // Panning Methods
  // ---------------------------------------------------------------------------

  /**
   * Setup pan container for smooth transformations
   */
  private setupPanContainer(): void {
    if (!this.options.enablePanning) return;

    // Create a wrapper div for panning transformations
    this.panContainer = document.createElement('div');
    this.panContainer.className = 'pan-container';
    this.panContainer.style.cssText = `
      width: 100%;
      height: 100%;
      transform-origin: 0 0;
      transition: transform 0.1s ease-out;
      will-change: transform;
    `;

    // Move all existing canvas children into the pan container
    const children = Array.from(this.options.canvas.children);
    for (const child of children) {
      if (child !== this.options.connectionsSvg) {
        this.panContainer.appendChild(child);
      }
    }

    // Add pan container to canvas
    this.options.canvas.appendChild(this.panContainer);

    // Style the canvas for panning
    this.options.canvas.style.overflow = 'hidden';
    this.options.canvas.style.cursor = 'grab';

    // Style the SVG for panning
    this.options.connectionsSvg.style.transformOrigin = '0 0';
    this.options.connectionsSvg.style.transition = 'transform 0.1s ease-out';
    this.options.connectionsSvg.style.willChange = 'transform';
  }

  /**
   * Start panning operation
   */
  private startPan(x: number, y: number): void {
    if (!this.options.enablePanning || this.dragState.isDragging) return;

    this.panState.isPanning = true;
    this.panState.panStart = { x, y };
    this.panState.lastPanOffset = { ...this.panState.panOffset };
    
    this.options.canvas.style.cursor = 'grabbing';
    this.options.canvas.classList.add('panning');
    
    // Disable transitions during panning for smoothness
    if (this.panContainer) {
      this.panContainer.style.transition = 'none';
    }
    this.options.connectionsSvg.style.transition = 'none';
    
    this.updateStatus('Panning...', 'running');
  }

  /**
   * Update pan during mouse movement
   */
  private updatePan(x: number, y: number): void {
    if (!this.panState.isPanning) return;

    const deltaX = x - this.panState.panStart.x;
    const deltaY = y - this.panState.panStart.y;

    this.panState.panOffset = {
      x: this.panState.lastPanOffset.x + deltaX,
      y: this.panState.lastPanOffset.y + deltaY
    };

    this.applyPanTransform();
  }

  /**
   * End panning operation
   */
  private endPan(): void {
    if (!this.panState.isPanning) return;

    this.panState.isPanning = false;
    
    this.options.canvas.style.cursor = this.panState.spaceKeyDown ? 'grab' : '';
    this.options.canvas.classList.remove('panning');
    
    // Re-enable transitions
    if (this.panContainer) {
      this.panContainer.style.transition = 'transform 0.1s ease-out';
    }
    this.options.connectionsSvg.style.transition = 'transform 0.1s ease-out';

    this.options.onPanChanged?.(this.panState.panOffset.x, this.panState.panOffset.y);
    this.updateStatus('Ready', 'success');
  }

  /**
   * Apply pan transformation to canvas and SVG
   */
  private applyPanTransform(): void {
    const transform = `translate(${this.panState.panOffset.x}px, ${this.panState.panOffset.y}px)`;
    
    if (this.panContainer) {
      this.panContainer.style.transform = transform;
    }
    this.options.connectionsSvg.style.transform = transform;
  }

  /**
   * Reset pan to origin
   */
  public resetPan(): void {
    this.panState.panOffset = { x: 0, y: 0 };
    this.panState.lastPanOffset = { x: 0, y: 0 };
    this.applyPanTransform();
    this.options.onPanChanged?.(0, 0);
    this.updateStatus('Pan reset to origin', 'success');
  }

  /**
   * Center view on all elements
   */
  public centerView(): void {
    if (this.elements.size === 0) {
      this.resetPan();
      return;
    }

    // Calculate bounding box of all elements
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const element of this.elements.values()) {
      minX = Math.min(minX, element.x);
      minY = Math.min(minY, element.y);
      maxX = Math.max(maxX, element.x + 140); // element width
      maxY = Math.max(maxY, element.y + 64);  // element height
    }

    // Calculate center offset
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    const canvasRect = this.options.canvas.getBoundingClientRect();
    const offsetX = canvasRect.width / 2 - centerX;
    const offsetY = canvasRect.height / 2 - centerY;

    this.panState.panOffset = { x: offsetX, y: offsetY };
    this.panState.lastPanOffset = { ...this.panState.panOffset };
    this.applyPanTransform();
    
    this.options.onPanChanged?.(offsetX, offsetY);
    this.updateStatus('View centered on elements', 'success');
  }

  /**
   * Pan to specific element
   */
  public panToElement(elementId: string): void {
    const element = this.elements.get(elementId);
    if (!element) return;

    const canvasRect = this.options.canvas.getBoundingClientRect();
    const offsetX = canvasRect.width / 2 - element.x - 70; // half element width
    const offsetY = canvasRect.height / 2 - element.y - 32; // half element height

    this.panState.panOffset = { x: offsetX, y: offsetY };
    this.panState.lastPanOffset = { ...this.panState.panOffset };
    this.applyPanTransform();
    
    this.options.onPanChanged?.(offsetX, offsetY);
    this.updateStatus(`Panned to element ${elementId}`, 'success');
  }

  /**
   * Get current pan offset
   */
  public getPanOffset(): { x: number; y: number } {
    return { ...this.panState.panOffset };
  }

  /**
   * Set pan offset programmatically
   */
  public setPanOffset(x: number, y: number): void {
    this.panState.panOffset = { x, y };
    this.panState.lastPanOffset = { x, y };
    this.applyPanTransform();
    this.options.onPanChanged?.(x, y);
  }

  // ---------------------------------------------------------------------------
  // Enhanced Event Handling
  // ---------------------------------------------------------------------------

  /**
   * Setup event listeners with panning support
   */
  private setupEventListeners(): void {
    this.eventAbortController = new AbortController();
    const signal = this.eventAbortController.signal;

    // Canvas interaction events
    this.options.canvas.addEventListener('click', this.handleCanvasClick, { signal });
    this.options.canvas.addEventListener('mousedown', this.handleMouseDown, { signal });
    this.options.canvas.addEventListener('wheel', this.handleWheel, { signal, passive: false });
    
    // Global mouse events for dragging and panning
    document.addEventListener('mousemove', this.handleMouseMove, { signal });
    document.addEventListener('mouseup', this.handleMouseUp, { signal });
    
    // Keyboard events for panning and shortcuts
    if (this.options.enableKeyboardShortcuts) {
      document.addEventListener('keydown', this.handleKeyDown, { signal });
      document.addEventListener('keyup', this.handleKeyUp, { signal });
    }

    // Double-click and context menu for inline editing
    if (this.options.enableInlineEditing) {
      this.options.canvas.addEventListener('dblclick', this.handleDoubleClick, { signal });
      this.options.canvas.addEventListener('contextmenu', this.handleContextMenu, { signal });
      document.addEventListener('click', this.hideContextMenu, { signal });
    }

    // Prevent default context menu on canvas
    if (!this.options.enableInlineEditing) {
      this.options.canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    }
  }

  /**
   * Enhanced mouse down handler with panning support
   */
  private readonly handleMouseDown = (e: MouseEvent): void => {
    // Check for panning conditions
    const shouldPan = this.shouldStartPan(e);
    
    if (shouldPan && !this.connectionState.connectMode) {
      e.preventDefault();
      this.startPan(e.clientX, e.clientY);
      return;
    }

    // Existing element dragging logic
    if (this.connectionState.connectMode || (e.target as Element).closest('.connection-point')) {
      return;
    }

    const element = (e.target as Element).closest('.element') as HTMLElement;
    if (!element) return;

    this.dragState.isDragging = true;
    this.dragState.selectedElement = element;
    
    const rect = element.getBoundingClientRect();
    const canvasRect = this.options.canvas.getBoundingClientRect();
    
    // Account for pan offset in drag calculations
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
   * Enhanced mouse move handler with panning support
   */
  private readonly handleMouseMove = (e: MouseEvent): void => {
    // Handle panning
    if (this.panState.isPanning) {
      this.updatePan(e.clientX, e.clientY);
      return;
    }

    // Handle element dragging (existing logic with pan compensation)
    if (!this.dragState.isDragging || !this.dragState.selectedElement) {
      return;
    }
    
    const canvasRect = this.options.canvas.getBoundingClientRect();
    
    // Calculate position relative to canvas, accounting for pan offset
    const x = e.clientX - canvasRect.left - this.dragState.dragOffset.x - this.panState.panOffset.x;
    const y = e.clientY - canvasRect.top - this.dragState.dragOffset.y - this.panState.panOffset.y;
    
    this.renderer.updateElementPosition(
      this.dragState.selectedElement, 
      Math.max(0, x), 
      Math.max(0, y), 
      this.options.snapToGrid
    );
    
    // Update element data
    const elementId = this.dragState.selectedElement.dataset.elementId;
    if (elementId) {
      const elementData = this.elements.get(elementId);
      if (elementData) {
        elementData.x = Math.max(0, x);
        elementData.y = Math.max(0, y);
        this.renderer.updateElementConnections(elementId, this.connections, this.domElements);
      }
    }
  };

  /**
   * Enhanced mouse up handler with panning support
   */
  private readonly handleMouseUp = (): void => {
    // End panning
    if (this.panState.isPanning) {
      this.endPan();
      return;
    }

    // End element dragging (existing logic)
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
   * Handle mouse wheel for zooming (future enhancement)
   */
  private readonly handleWheel = (e: WheelEvent): void => {
    // For now, just prevent default scrolling on canvas
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // TODO: Implement zooming functionality
      this.updateStatus('Zoom not yet implemented', 'error');
    }
  };

  /**
   * Enhanced keyboard handler with panning shortcuts
   */
  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    // Handle space key for pan mode
    if (e.code === 'Space' && !this.panState.spaceKeyDown) {
      e.preventDefault();
      this.panState.spaceKeyDown = true;
      this.options.canvas.style.cursor = 'grab';
    }

    // Panning shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case '0':
          e.preventDefault();
          this.resetPan();
          break;
        case '9':
          e.preventDefault();
          this.centerView();
          break;
      }
    }

    // Arrow key panning
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const panStep = 50;
      let panDelta = { x: 0, y: 0 };
      
      switch (e.key) {
        case 'ArrowLeft':
          panDelta.x = panStep;
          break;
        case 'ArrowRight':
          panDelta.x = -panStep;
          break;
        case 'ArrowUp':
          panDelta.y = panStep;
          break;
        case 'ArrowDown':
          panDelta.y = -panStep;
          break;
      }
      
      if (panDelta.x !== 0 || panDelta.y !== 0) {
        e.preventDefault();
        this.panState.panOffset.x += panDelta.x;
        this.panState.panOffset.y += panDelta.y;
        this.panState.lastPanOffset = { ...this.panState.panOffset };
        this.applyPanTransform();
        this.options.onPanChanged?.(this.panState.panOffset.x, this.panState.panOffset.y);
      }
    }

    // Existing keyboard shortcuts
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

    // Additional shortcuts (implementation would be here)
  };

  /**
   * Handle key up events
   */
  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      this.panState.spaceKeyDown = false;
      if (!this.panState.isPanning) {
        this.options.canvas.style.cursor = '';
      }
    }
  };

  /**
   * Determine if panning should start based on mouse event
   */
  private shouldStartPan(e: MouseEvent): boolean {
    if (!this.options.enablePanning) return false;
    
    // Don't pan if clicking on an element or connection point
    if ((e.target as Element).closest('.element') || (e.target as Element).closest('.connection-point')) {
      return false;
    }

    switch (this.options.panButton) {
      case 'middle':
        return e.button === 1; // Middle mouse button
      case 'right':
        return e.button === 2; // Right mouse button
      case 'space':
        return this.panState.spaceKeyDown && e.button === 0; // Space + left click
      default:
        return e.button === 1; // Default to middle mouse
    }
  }

  // ---------------------------------------------------------------------------
  // Enhanced Methods (existing methods modified for panning)
  // ---------------------------------------------------------------------------

  /**
   * Add element with pan offset consideration
   */
  public addElement(type: string, x?: number, y?: number, props: Record<string, unknown> = {}): string {
    this.checkDisposed();
    
    if (this.elements.size >= (this.options.maxElements ?? 1000)) {
      throw new Error(`Maximum number of elements reached (${this.options.maxElements})`);
    }

    if (!BlockRegistry.has(type)) {
      throw new Error(`Unknown block type: ${type}. Available types: ${BlockRegistry.getTypes().join(', ')}`);
    }

    const definition = BlockRegistry.get(type)!;
    const id = this.generateId();
    
    // Use provided coordinates or generate safe random ones
    // Account for current pan offset to place elements in visible area
    const elementX = x ?? (this.generateSafeX() - this.panState.panOffset.x);
    const elementY = y ?? (this.generateSafeY() - this.panState.panOffset.y);
    
    // Ensure coordinates are reasonable
    const finalX = Math.max(0, elementX);
    const finalY = Math.max(0, elementY);
    
    const safeProps = this.sanitizeProps(props);
    const elementProps = { ...definition.defaultProps, ...safeProps };
    
    const elementData: ElementData = {
      id,
      type,
      x: finalX,
      y: finalY,
      props: elementProps
    };

    try {
      const domElement = this.renderer.renderElement(elementData);
      
      // Add to pan container instead of canvas directly
      const container = this.panContainer ?? this.options.canvas;
      container.appendChild(domElement);
      
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
   * Get enhanced editor statistics including pan state
   */
  public getStats(): EditorStats {
    this.checkDisposed();
    
    return {
      elementCount: this.elements.size,
      connectionCount: this.connections.size,
      selectedElement: this.dragState.selectedElement?.dataset.elementId ?? null,
      isConnectMode: this.connectionState.connectMode,
      isDragging: this.dragState.isDragging,
      isPanning: this.panState.isPanning,
      panOffset: { ...this.panState.panOffset }
    };
  }

  // ---------------------------------------------------------------------------
  // Existing methods (stubs - full implementation would include all methods from original Editor)
  // ---------------------------------------------------------------------------

  // For brevity, I'm including key method signatures. Full implementation would include:
  
  public removeElement(elementId: string): boolean {
    // Implementation here
    return false;
  }

  public createConnection(fromId: string, toId: string): string | null {
    // Implementation here
    return null;
  }

  public removeConnection(connectionId: string): boolean {
    // Implementation here
    return false;
  }

  public toggleConnectMode(): void {
    // Implementation here
  }

  public clearAll(): void {
    // Implementation here - also reset pan
    this.resetPan();
  }

  public async executeProgram(options: Partial<ExecutionOptions> = {}): Promise<void> {
    // Implementation here
  }

  public getState(): { elements: ElementData[]; connections: ConnectionData[] } {
    // Implementation here
    return { elements: [], connections: [] };
  }

  public loadState(state: { elements: ElementData[]; connections: ConnectionData[] }): void {
    // Implementation here
    // After loading, optionally center view
    setTimeout(() => this.centerView(), 100);
  }

  public dispose(): void {
    if (this.isDisposed) return;
    
    try {
      if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
      if (this.eventAbortController) this.eventAbortController.abort();
      
      this.clearAll();
      this.renderer.dispose();
      
      this.isDisposed = true;
    } catch (error) {
      console.error('Error during editor disposal:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  private checkDisposed(): void {
    if (this.isDisposed) {
      throw new Error('Editor has been disposed');
    }
  }

  private generateId(): string {
    return `element-${++this.idCounter}-${Date.now()}`;
  }

  private generateSafeX(): number {
    const canvasWidth = this.options.canvas.clientWidth || 800;
    return Math.random() * Math.max(200, canvasWidth - 400) + 100;
  }

  private generateSafeY(): number {
    const canvasHeight = this.options.canvas.clientHeight || 600;
    return Math.random() * Math.max(200, canvasHeight - 300) + 100;
  }

  private sanitizeProps(props: unknown): Record<string, unknown> {
    // Implementation here
    return {};
  }

  private setupAutoSave(): void {
    // Implementation here
  }

  private updateStatus(message: string, type?: 'success' | 'error' | 'running'): void {
    try {
      this.options.onStatusUpdate?.(message, type);
    } catch (error) {
      console.warn('Failed to update status:', error);
    }
  }

  // Inline editing methods (stubs)
  private readonly handleDoubleClick = (e: MouseEvent): void => {
    // Implementation here
  };

  private readonly handleContextMenu = (e: MouseEvent): void => {
    // Implementation here
  };

  private readonly handleCanvasClick = (e: MouseEvent): void => {
    // Implementation here
  };

  private hideContextMenu(): void {
    // Implementation here
  }

  private hideInlineEditor(): void {
    // Implementation here
  }

  private clearConnectionSelection(): void {
    // Implementation here
  }
}