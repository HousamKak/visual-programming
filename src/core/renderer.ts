/**
 * Renderer - Handles all DOM manipulation for visual elements
 * Provides safe, validated DOM operations with comprehensive error handling
 */

import { BlockRegistry, type BlockDefinition } from './registry.js';

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export interface ElementData {
  readonly id: string;
  readonly type: string;
  x: number;
  y: number;
  props: Record<string, unknown>;
  processed?: boolean;
}

export interface ConnectionData {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly fromOutput?: string;
  readonly toInput?: string;
}

interface RendererOptions {
  readonly gridSize?: number;
  readonly snapToGrid?: boolean;
  readonly maxElements?: number;
  readonly maxConnections?: number;
  readonly enableAnimations?: boolean;
}

interface ElementBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// Validation Functions
// ---------------------------------------------------------------------------

/**
 * Validates element data structure
 */
function validateElementData(elementData: unknown): asserts elementData is ElementData {
  if (!elementData || typeof elementData !== 'object') {
    throw new TypeError('Element data must be a non-null object');
  }

  const element = elementData as Record<string, unknown>;

  if (typeof element.id !== 'string' || element.id.trim() === '') {
    throw new TypeError('Element ID must be a non-empty string');
  }

  if (element.id.length > 100) {
    throw new TypeError('Element ID too long (max 100 characters)');
  }

  if (typeof element.type !== 'string' || element.type.trim() === '') {
    throw new TypeError('Element type must be a non-empty string');
  }

  if (typeof element.x !== 'number' || !isFinite(element.x)) {
    throw new TypeError('Element x coordinate must be a finite number');
  }

  if (typeof element.y !== 'number' || !isFinite(element.y)) {
    throw new TypeError('Element y coordinate must be a finite number');
  }

  if (!element.props || typeof element.props !== 'object' || Array.isArray(element.props)) {
    throw new TypeError('Element props must be a plain object');
  }

  // Validate coordinate bounds
  if (element.x < -10000 || element.x > 50000) {
    throw new RangeError('Element x coordinate out of valid range (-10000 to 50000)');
  }

  if (element.y < -10000 || element.y > 50000) {
    throw new RangeError('Element y coordinate out of valid range (-10000 to 50000)');
  }
}

/**
 * Validates connection data structure
 */
function validateConnectionData(connectionData: unknown): asserts connectionData is ConnectionData {
  if (!connectionData || typeof connectionData !== 'object') {
    throw new TypeError('Connection data must be a non-null object');
  }

  const connection = connectionData as Record<string, unknown>;

  if (typeof connection.id !== 'string' || connection.id.trim() === '') {
    throw new TypeError('Connection ID must be a non-empty string');
  }

  if (connection.id.length > 100) {
    throw new TypeError('Connection ID too long (max 100 characters)');
  }

  if (typeof connection.fromId !== 'string' || connection.fromId.trim() === '') {
    throw new TypeError('Connection fromId must be a non-empty string');
  }

  if (typeof connection.toId !== 'string' || connection.toId.trim() === '') {
    throw new TypeError('Connection toId must be a non-empty string');
  }

  if (connection.fromId === connection.toId) {
    throw new Error('Connection cannot connect element to itself');
  }

  if (connection.fromOutput !== undefined) {
    if (typeof connection.fromOutput !== 'string' || connection.fromOutput.trim() === '') {
      throw new TypeError('Connection fromOutput must be a non-empty string if provided');
    }
  }

  if (connection.toInput !== undefined) {
    if (typeof connection.toInput !== 'string' || connection.toInput.trim() === '') {
      throw new TypeError('Connection toInput must be a non-empty string if provided');
    }
  }
}

/**
 * Validates DOM element reference
 */
function validateDOMElement(element: unknown, name: string): asserts element is HTMLElement {
  if (!element || !(element instanceof HTMLElement)) {
    throw new TypeError(`${name} must be a valid HTMLElement`);
  }

  if (!element.isConnected) {
    throw new Error(`${name} must be attached to the DOM`);
  }
}

/**
 * Validates SVG element reference
 */
function validateSVGElement(element: unknown, name: string): asserts element is SVGElement {
  if (!element || !(element instanceof SVGElement)) {
    throw new TypeError(`${name} must be a valid SVGElement`);
  }

  if (!element.isConnected) {
    throw new Error(`${name} must be attached to the DOM`);
  }
}

/**
 * Sanitizes string content for safe DOM insertion
 */
function sanitizeString(str: unknown): string {
  if (typeof str !== 'string') {
    str = String(str);
  }
  
  // Remove potentially dangerous characters and limit length
  return (str as string)
    .replace(/[<>'"&]/g, '')
    .slice(0, 1000);
}

/**
 * Sanitizes numeric values for positioning
 */
function sanitizeCoordinate(value: unknown): number {
  if (typeof value !== 'number') {
    value = Number(value);
  }
  
  if (!isFinite(value as number)) {
    return 0;
  }
  
  return Math.max(-10000, Math.min(50000, value as number));
}

// ---------------------------------------------------------------------------
// Renderer Implementation
// ---------------------------------------------------------------------------

/**
 * Renderer handles all DOM manipulation for the visual programming interface
 * with comprehensive error handling and validation
 */
export class Renderer {
  private readonly canvas: HTMLElement;
  private readonly connectionsSvg: SVGElement;
  private readonly options: Required<RendererOptions>;
  private readonly renderedElements = new Set<string>();
  private readonly renderedConnections = new Set<string>();
  private resizeObserver?: ResizeObserver;
  private animationFrameId?: number;

  /**
   * Creates a new Renderer instance
   * @param canvas - Main canvas element for positioning blocks
   * @param connectionsSvg - SVG element for drawing connections
   * @param options - Renderer configuration options
   */
  constructor(canvas: HTMLElement, connectionsSvg: SVGElement, options: RendererOptions = {}) {
    validateDOMElement(canvas, 'Canvas');
    validateSVGElement(connectionsSvg, 'Connections SVG');

    this.canvas = canvas;
    this.connectionsSvg = connectionsSvg;
    this.options = {
      gridSize: 16,
      snapToGrid: true,
      maxElements: 1000,
      maxConnections: 2000,
      enableAnimations: true,
      ...options
    };

    this.validateOptions();
    this.initializeRenderer();
  }

  /**
   * Create and render a visual element from element data
   * @param elementData - Element data to render
   * @returns Created DOM element
   * @throws {Error} If element cannot be rendered
   */
  renderElement(elementData: ElementData): HTMLElement {
    validateElementData(elementData);

    if (this.renderedElements.size >= this.options.maxElements) {
      throw new Error(`Maximum number of elements reached (${this.options.maxElements})`);
    }

    if (this.renderedElements.has(elementData.id)) {
      throw new Error(`Element with ID "${elementData.id}" already rendered`);
    }

    const definition = BlockRegistry.get(elementData.type);
    if (!definition) {
      throw new Error(`Unknown block type: ${elementData.type}`);
    }

    try {
      const element = this.createElement(elementData, definition);
      this.positionElement(element, elementData.x, elementData.y);
      this.addConnectionPoints(element, definition);
      this.addElementAttributes(element, elementData);
      
      this.renderedElements.add(elementData.id);
      
      return element;
    } catch (error) {
      throw new Error(
        `Failed to render element ${elementData.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Update element position with validation and optional grid snapping
   * @param element - DOM element to position
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param snapToGrid - Whether to snap to grid
   */
  updateElementPosition(element: HTMLElement, x: number, y: number, snapToGrid = true): void {
    validateDOMElement(element, 'Element');

    const safeX = sanitizeCoordinate(x);
    const safeY = sanitizeCoordinate(y);

    const finalX = snapToGrid ? this.snapToGrid(safeX) : safeX;
    const finalY = snapToGrid ? this.snapToGrid(safeY) : safeY;

    this.positionElement(element, finalX, finalY);
  }

  /**
   * Render a connection line between two elements
   * @param connection - Connection data
   * @param fromElement - Source element
   * @param toElement - Target element
   * @returns Created SVG line element
   */
  renderConnection(connection: ConnectionData, fromElement: HTMLElement, toElement: HTMLElement): SVGLineElement {
    validateConnectionData(connection);
    validateDOMElement(fromElement, 'From element');
    validateDOMElement(toElement, 'To element');

    if (this.renderedConnections.size >= this.options.maxConnections) {
      throw new Error(`Maximum number of connections reached (${this.options.maxConnections})`);
    }

    if (this.renderedConnections.has(connection.id)) {
      throw new Error(`Connection with ID "${connection.id}" already rendered`);
    }

    if (!fromElement.isConnected || !toElement.isConnected) {
      throw new Error('Both elements must be attached to the DOM');
    }

    try {
      const line = this.createConnectionLine(connection, fromElement, toElement);
      this.connectionsSvg.appendChild(line);
      this.renderedConnections.add(connection.id);
      
      return line;
    } catch (error) {
      throw new Error(
        `Failed to render connection ${connection.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Remove a connection line safely
   * @param connectionId - ID of connection to remove
   * @returns True if connection was removed
   */
  removeConnection(connectionId: string): boolean {
    if (typeof connectionId !== 'string' || connectionId.trim() === '') {
      throw new TypeError('Connection ID must be a non-empty string');
    }

    const line = this.connectionsSvg.querySelector(`[data-connection-id="${CSS.escape(connectionId)}"]`);
    if (line) {
      line.remove();
      this.renderedConnections.delete(connectionId);
      return true;
    }
    
    return false;
  }

  /**
   * Update all connections for a moved element
   * @param elementId - ID of the moved element
   * @param connections - Map of all connections
   * @param elements - Map of all element DOM nodes
   */
  updateElementConnections(
    elementId: string, 
    connections: Map<string, ConnectionData>, 
    elements: Map<string, HTMLElement>
  ): void {
    if (typeof elementId !== 'string' || elementId.trim() === '') {
      throw new TypeError('Element ID must be a non-empty string');
    }

    if (!(connections instanceof Map)) {
      throw new TypeError('Connections must be a Map instance');
    }

    if (!(elements instanceof Map)) {
      throw new TypeError('Elements must be a Map instance');
    }

    // Remove affected connection lines
    const affectedSelectors = [
      `[data-from-id="${CSS.escape(elementId)}"]`,
      `[data-to-id="${CSS.escape(elementId)}"]`
    ];

    for (const selector of affectedSelectors) {
      const oldLines = this.connectionsSvg.querySelectorAll(selector);
      oldLines.forEach(line => {
        const connectionId = line.getAttribute('data-connection-id');
        if (connectionId) {
          this.renderedConnections.delete(connectionId);
        }
        line.remove();
      });
    }

    // Re-render affected connections
    let rerenderedCount = 0;
    for (const connection of connections.values()) {
      if (rerenderedCount >= 100) {
        console.warn('Too many connections to re-render, stopping to prevent performance issues');
        break;
      }

      if (connection.fromId === elementId || connection.toId === elementId) {
        const fromElement = elements.get(connection.fromId);
        const toElement = elements.get(connection.toId);
        
        if (fromElement && toElement) {
          try {
            this.renderConnection(connection, fromElement, toElement);
            rerenderedCount++;
          } catch (error) {
            console.warn(`Failed to re-render connection ${connection.id}:`, error);
          }
        }
      }
    }
  }

  /**
   * Clear all rendered content safely
   */
  clear(): void {
    try {
      // Remove all elements
      const elements = this.canvas.querySelectorAll('.element');
      elements.forEach(el => {
        try {
          el.remove();
        } catch (error) {
          console.warn('Error removing element:', error);
        }
      });
      
      // Clear connections SVG
      this.connectionsSvg.innerHTML = '';
      
      // Clear tracking sets
      this.renderedElements.clear();
      this.renderedConnections.clear();
      
    } catch (error) {
      console.error('Error during clear operation:', error);
      // Force clear tracking sets even if DOM operations failed
      this.renderedElements.clear();
      this.renderedConnections.clear();
    }
  }

  /**
   * Create animated flow particle between elements
   * @param fromElement - Source element
   * @param toElement - Target element
   * @returns Promise that resolves when animation completes
   */
  createFlowParticle(fromElement: HTMLElement, toElement: HTMLElement): Promise<void> {
    validateDOMElement(fromElement, 'From element');
    validateDOMElement(toElement, 'To element');

    if (!this.options.enableAnimations) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        const canvasRect = this.canvas.getBoundingClientRect();
        const fromRect = fromElement.getBoundingClientRect();
        const toRect = toElement.getBoundingClientRect();

        const fromX = fromRect.right - canvasRect.left;
        const fromY = (fromRect.top + fromRect.bottom) / 2 - canvasRect.top;
        const toX = toRect.left - canvasRect.left;
        const toY = (toRect.top + toRect.bottom) / 2 - canvasRect.top;

        const particle = document.createElement('div');
        particle.className = 'flow-particle';
        particle.style.cssText = `
          position: absolute;
          width: 6px;
          height: 6px;
          background: var(--accent-orange, #f59e0b);
          border-radius: 50%;
          box-shadow: 0 0 10px currentColor;
          z-index: 15;
          pointer-events: none;
          left: ${fromX}px;
          top: ${fromY}px;
        `;

        this.canvas.appendChild(particle);

        // Animate to destination
        requestAnimationFrame(() => {
          particle.style.transition = 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
          particle.style.left = `${toX}px`;
          particle.style.top = `${toY}px`;
          particle.style.opacity = '0';
        });

        setTimeout(() => {
          try {
            if (particle.parentNode) {
              particle.remove();
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        }, 800);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Highlight or unhighlight a connection line
   * @param connectionId - ID of connection to highlight
   * @param highlight - Whether to highlight or remove highlight
   */
  highlightConnection(connectionId: string, highlight = true): void {
    if (typeof connectionId !== 'string' || connectionId.trim() === '') {
      return; // Silently ignore invalid IDs
    }

    try {
      const line = this.connectionsSvg.querySelector(
        `[data-connection-id="${CSS.escape(connectionId)}"]`
      ) as SVGLineElement;
      
      if (line) {
        if (highlight) {
          line.classList.add('active');
        } else {
          line.classList.remove('active');
        }
      }
    } catch (error) {
      console.warn(`Failed to highlight connection ${connectionId}:`, error);
    }
  }

  /**
   * Get element bounds for collision detection or layout
   * @param element - Element to get bounds for
   * @returns Element bounds
   */
  getElementBounds(element: HTMLElement): ElementBounds {
    validateDOMElement(element, 'Element');

    const rect = element.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();

    return {
      x: rect.left - canvasRect.left,
      y: rect.top - canvasRect.top,
      width: rect.width,
      height: rect.height
    };
  }

  /**
   * Get renderer statistics
   * @returns Current renderer state statistics
   */
  getStats(): Readonly<{
    renderedElements: number;
    renderedConnections: number;
    maxElements: number;
    maxConnections: number;
    canvasSize: { width: number; height: number };
  }> {
    const canvasRect = this.canvas.getBoundingClientRect();
    
    return Object.freeze({
      renderedElements: this.renderedElements.size,
      renderedConnections: this.renderedConnections.size,
      maxElements: this.options.maxElements,
      maxConnections: this.options.maxConnections,
      canvasSize: {
        width: canvasRect.width,
        height: canvasRect.height
      }
    });
  }

  /**
   * Dispose of renderer resources
   */
  dispose(): void {
    try {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }

      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
      }

      this.clear();
      
    } catch (error) {
      console.error('Error during renderer disposal:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Initialize renderer with event listeners and observers
   */
  private initializeRenderer(): void {
    this.updateConnectionsSvgSize();
    
    // Set up resize observer for SVG size updates
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateConnectionsSvgSize();
      });
      this.resizeObserver.observe(this.canvas);
    } else {
      // Fallback for browsers without ResizeObserver
      window.addEventListener('resize', () => this.updateConnectionsSvgSize());
    }
  }

  /**
   * Validate renderer options
   */
  private validateOptions(): void {
    if (this.options.gridSize <= 0 || this.options.gridSize > 100) {
      throw new RangeError('Grid size must be between 1 and 100 pixels');
    }

    if (this.options.maxElements <= 0 || this.options.maxElements > 10000) {
      throw new RangeError('Max elements must be between 1 and 10000');
    }

    if (this.options.maxConnections <= 0 || this.options.maxConnections > 20000) {
      throw new RangeError('Max connections must be between 1 and 20000');
    }
  }

  /**
   * Update SVG dimensions to match canvas
   */
  private updateConnectionsSvgSize(): void {
    try {
      const rect = this.canvas.getBoundingClientRect();
      this.connectionsSvg.setAttribute('width', String(Math.max(rect.width, 100)));
      this.connectionsSvg.setAttribute('height', String(Math.max(rect.height, 100)));
    } catch (error) {
      console.warn('Failed to update SVG size:', error);
    }
  }

  /**
   * Create DOM element for a block with safe content handling
   */
  private createElement(elementData: ElementData, definition: BlockDefinition): HTMLElement {
    const element = document.createElement('div');
    element.className = `element ${sanitizeString(elementData.type)}`;
    
    // Set safe dimensions
    element.style.width = 'var(--block-w, 140px)';
    element.style.height = definition.isCircular ? 'var(--block-h-circle, 80px)' : 'var(--block-h, 64px)';

    if (definition.isCircular) {
      element.classList.add('circular');
    }

    // Get safely rendered content
    let rendered;
    try {
      rendered = definition.render!(elementData.props);
    } catch (error) {
      console.warn(`Render function failed for ${elementData.type}:`, error);
      rendered = {
        label: sanitizeString(definition.displayName),
        content: sanitizeString(elementData.type)
      };
    }

    // Create content structure with sanitized content
    const labelEl = document.createElement('div');
    labelEl.className = 'element-label';
    labelEl.textContent = sanitizeString(rendered.label);

    const contentEl = document.createElement('div');
    contentEl.className = 'element-content';
    contentEl.textContent = sanitizeString(rendered.content);

    element.appendChild(labelEl);
    element.appendChild(contentEl);

    // Add value display if provided
    if (rendered.value !== undefined) {
      const valueEl = document.createElement('div');
      valueEl.className = 'element-value';
      valueEl.textContent = sanitizeString(rendered.value);
      element.appendChild(valueEl);
    }

    // Special rendering for array type
    if (elementData.type === 'array' && Array.isArray(elementData.props.items)) {
      this.renderArrayContent(contentEl, elementData.props.items as unknown[]);
    }

    return element;
  }

  /**
   * Add element attributes for identification and interaction
   */
  private addElementAttributes(element: HTMLElement, elementData: ElementData): void {
    element.setAttribute('data-element-id', elementData.id);
    element.setAttribute('data-block-type', elementData.type);
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');
    element.setAttribute('aria-label', `${elementData.type} block`);
  }

  /**
   * Special rendering for array elements with safe content handling
   */
  private renderArrayContent(container: HTMLElement, items: unknown[]): void {
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
      const itemStr = sanitizeString(item);
      itemEl.textContent = itemStr.slice(0, 2);
      itemEl.title = itemStr.slice(0, 100); // Limit tooltip length
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
   * Position element safely in canvas
   */
  private positionElement(element: HTMLElement, x: number, y: number): void {
    const safeX = sanitizeCoordinate(x);
    const safeY = sanitizeCoordinate(y);
    
    element.style.left = `${safeX}px`;
    element.style.top = `${safeY}px`;
  }

  /**
   * Add input/output connection points to element
   */
  private addConnectionPoints(element: HTMLElement, definition: BlockDefinition): void {
    // Add input point if has inputs
    if (definition.inputs.length > 0) {
      const inputPoint = document.createElement('div');
      inputPoint.className = 'connection-point input-point';
      inputPoint.setAttribute('data-connection-type', 'input');
      inputPoint.setAttribute('role', 'button');
      inputPoint.setAttribute('aria-label', 'Input connection point');
      inputPoint.title = `Input: ${definition.inputs.join(', ')}`;
      element.appendChild(inputPoint);
    }

    // Add output point if has outputs
    if (definition.outputs.length > 0) {
      const outputPoint = document.createElement('div');
      outputPoint.className = 'connection-point output-point';
      outputPoint.setAttribute('data-connection-type', 'output');
      outputPoint.setAttribute('role', 'button');
      outputPoint.setAttribute('aria-label', 'Output connection point');
      outputPoint.title = `Output: ${definition.outputs.join(', ')}`;
      element.appendChild(outputPoint);
    }
  }

  /**
   * Create SVG connection line with safe coordinate calculation
   */
  private createConnectionLine(connection: ConnectionData, fromElement: HTMLElement, toElement: HTMLElement): SVGLineElement {
    const canvasRect = this.canvas.getBoundingClientRect();
    const fromRect = fromElement.getBoundingClientRect();
    const toRect = toElement.getBoundingClientRect();

    // Calculate safe coordinates
    const fromX = Math.max(0, fromRect.right - canvasRect.left);
    const fromY = Math.max(0, (fromRect.top + fromRect.bottom) / 2 - canvasRect.top);
    const toX = Math.max(0, toRect.left - canvasRect.left);
    const toY = Math.max(0, (toRect.top + toRect.bottom) / 2 - canvasRect.top);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(fromX));
    line.setAttribute('y1', String(fromY));
    line.setAttribute('x2', String(toX));
    line.setAttribute('y2', String(toY));
    line.setAttribute('class', 'connection-line');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    line.setAttribute('data-connection-id', connection.id);
    line.setAttribute('data-from-id', connection.fromId);
    line.setAttribute('data-to-id', connection.toId);
    line.setAttribute('role', 'button');
    line.setAttribute('aria-label', `Connection from ${connection.fromId} to ${connection.toId}`);

    // Add accessibility
    line.style.cursor = 'pointer';
    
    return line;
  }

  /**
   * Snap coordinate to grid with bounds checking
   */
  private snapToGrid(value: number): number {
    const gridSize = this.options.gridSize;
    const snapped = Math.round(value / gridSize) * gridSize;
    return sanitizeCoordinate(snapped);
  }
}