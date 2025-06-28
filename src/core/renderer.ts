/**
 * Renderer - Handles all DOM manipulation for visual elements
 * Keeps rendering logic separate from business logic
 */

import { BlockRegistry, type BlockDefinition } from './registry.js';

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

export class Renderer {
  private readonly canvas: HTMLElement;
  private readonly connectionsSvg: SVGElement;
  private readonly gridSize = 16;

  constructor(canvas: HTMLElement, connectionsSvg: SVGElement) {
    if (!canvas || !connectionsSvg) {
      throw new TypeError('Canvas and connections SVG elements are required');
    }
    
    this.canvas = canvas;
    this.connectionsSvg = connectionsSvg;
    this.gridSize = 16; // Default grid size
    this.updateConnectionsSvgSize();
    
    // Listen for window resize to update SVG size
    window.addEventListener('resize', () => this.updateConnectionsSvgSize());
  }

  /**
   * Create a visual element from element data
   */
  renderElement(elementData: ElementData): HTMLElement {
    if (!elementData || typeof elementData !== 'object') {
      throw new TypeError('Element data is required');
    }

    if (!elementData.id || !elementData.type) {
      throw new TypeError('Element must have id and type');
    }

    const definition = BlockRegistry.get(elementData.type);
    if (!definition) {
      throw new Error(`Unknown block type: ${elementData.type}`);
    }

    const element = this.createElement(elementData, definition);
    this.positionElement(element, elementData.x, elementData.y);
    this.addConnectionPoints(element, definition);
    
    return element;
  }

  /**
   * Update element position and snap to grid
   */
  updateElementPosition(element: HTMLElement, x: number, y: number, snapToGrid = true): void {
    if (!element) {
      throw new TypeError('Element is required');
    }

    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new TypeError('Coordinates must be numbers');
    }

    if (snapToGrid) {
      x = this.snapToGrid(x);
      y = this.snapToGrid(y);
    }

    this.positionElement(element, x, y);
  }

  /**
   * Render a connection line between two elements
   */
  renderConnection(connection: ConnectionData, fromElement: HTMLElement, toElement: HTMLElement): SVGLineElement {
    if (!connection || !fromElement || !toElement) {
      throw new TypeError('Connection data and both elements are required');
    }

    const line = this.createConnectionLine(connection, fromElement, toElement);
    this.connectionsSvg.appendChild(line);
    return line;
  }

  /**
   * Remove a connection line
   */
  removeConnection(connectionId: string): void {
    if (typeof connectionId !== 'string') {
      throw new TypeError('Connection ID must be a string');
    }

    const line = this.connectionsSvg.querySelector(`[data-connection-id="${connectionId}"]`);
    if (line) {
      line.remove();
    }
  }

  /**
   * Update all connections for a moved element
   */
  updateElementConnections(elementId: string, connections: Map<string, ConnectionData>, elements: Map<string, HTMLElement>): void {
    if (typeof elementId !== 'string') {
      throw new TypeError('Element ID must be a string');
    }

    // Remove old connection lines for this element
    const oldLines = this.connectionsSvg.querySelectorAll(`[data-from-id="${elementId}"], [data-to-id="${elementId}"]`);
    oldLines.forEach(line => line.remove());

    // Re-render affected connections
    connections.forEach(connection => {
      if (connection.fromId === elementId || connection.toId === elementId) {
        const fromElement = elements.get(connection.fromId);
        const toElement = elements.get(connection.toId);
        
        if (fromElement && toElement) {
          this.renderConnection(connection, fromElement, toElement);
        }
      }
    });
  }

  /**
   * Clear all rendered content
   */
  clear(): void {
    // Remove all elements
    this.canvas.querySelectorAll('.element').forEach(el => el.remove());
    
    // Clear all connections
    this.connectionsSvg.innerHTML = '';
  }

  /**
   * Create flow animation particle
   */
  createFlowParticle(fromElement: HTMLElement, toElement: HTMLElement): Promise<void> {
    if (!fromElement || !toElement) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      const canvasRect = this.canvas.getBoundingClientRect();
      const fromRect = fromElement.getBoundingClientRect();
      const toRect = toElement.getBoundingClientRect();

      const fromX = fromRect.right - canvasRect.left;
      const fromY = (fromRect.top + fromRect.bottom) / 2 - canvasRect.top;
      const toX = toRect.left - canvasRect.left;
      const toY = (toRect.top + toRect.bottom) / 2 - canvasRect.top;

      const particle = document.createElement('div');
      particle.className = 'flow-particle';
      particle.style.left = `${fromX}px`;
      particle.style.top = `${fromY}px`;
      this.canvas.appendChild(particle);

      // Animate to destination
      requestAnimationFrame(() => {
        particle.style.transition = 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
        particle.style.left = `${toX}px`;
        particle.style.top = `${toY}px`;
        particle.style.opacity = '0';
      });

      setTimeout(() => {
        particle.remove();
        resolve();
      }, 800);
    });
  }

  /**
   * Highlight connection line during execution
   */
  highlightConnection(connectionId: string, highlight = true): void {
    if (typeof connectionId !== 'string') {
      return;
    }

    const line = this.connectionsSvg.querySelector(`[data-connection-id="${connectionId}"]`) as SVGLineElement;
    if (line) {
      if (highlight) {
        line.classList.add('active');
      } else {
        line.classList.remove('active');
      }
    }
  }

  /**
   * Update SVG size to match canvas
   */
  private updateConnectionsSvgSize(): void {
    this.connectionsSvg.setAttribute('width', String(window.innerWidth));
    this.connectionsSvg.setAttribute('height', String(window.innerHeight));
  }

  /**
   * Create DOM element for block
   */
  private createElement(elementData: ElementData, definition: BlockDefinition): HTMLElement {
    const element = document.createElement('div');
    element.className = `element ${elementData.type}`;
    element.dataset.elementId = elementData.id;
    element.dataset.blockType = elementData.type;

    // Set fixed dimensions
    element.style.width = 'var(--block-w)';
    element.style.height = definition.isCircular ? 'var(--block-h-circle)' : 'var(--block-h)';

    if (definition.isCircular) {
      element.classList.add('circular');
    }

    // Get rendered content
    const rendered = definition.render!(elementData.props);

    // Create content structure
    const labelEl = document.createElement('div');
    labelEl.className = 'element-label';
    labelEl.textContent = rendered.label;

    const contentEl = document.createElement('div');
    contentEl.className = 'element-content';
    contentEl.textContent = rendered.content;

    element.appendChild(labelEl);
    element.appendChild(contentEl);

    // Add value display if provided
    if (rendered.value !== undefined) {
      const valueEl = document.createElement('div');
      valueEl.className = 'element-value';
      valueEl.textContent = rendered.value;
      element.appendChild(valueEl);
    }

    // Special rendering for array type
    if (elementData.type === 'array' && Array.isArray(elementData.props.items)) {
      this.renderArrayContent(contentEl, elementData.props.items as unknown[]);
    }

    return element;
  }

  /**
   * Special rendering for array elements
   */
  private renderArrayContent(container: HTMLElement, items: unknown[]): void {
    container.innerHTML = '';
    container.className = 'element-content array-container';

    const openBracket = document.createElement('span');
    openBracket.className = 'array-bracket';
    openBracket.textContent = '[';
    container.appendChild(openBracket);

    const maxVisible = 5;
    const visibleItems = items.slice(0, maxVisible);

    visibleItems.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'array-item';
      itemEl.textContent = String(item).slice(0, 2);
      itemEl.title = String(item);
      container.appendChild(itemEl);
    });

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
   * Position element in canvas
   */
  private positionElement(element: HTMLElement, x: number, y: number): void {
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  }

  /**
   * Add input/output connection points to element
   */
  private addConnectionPoints(element: HTMLElement, definition: BlockDefinition): void {
    // Add input point if has inputs
    if (definition.inputs.length > 0) {
      const inputPoint = document.createElement('div');
      inputPoint.className = 'connection-point input-point';
      inputPoint.dataset.connectionType = 'input';
      inputPoint.title = `Input: ${definition.inputs.join(', ')}`;
      element.appendChild(inputPoint);
    }

    // Add output point if has outputs
    if (definition.outputs.length > 0) {
      const outputPoint = document.createElement('div');
      outputPoint.className = 'connection-point output-point';
      outputPoint.dataset.connectionType = 'output';
      outputPoint.title = `Output: ${definition.outputs.join(', ')}`;
      element.appendChild(outputPoint);
    }
  }

  /**
   * Create SVG connection line
   */
  private createConnectionLine(connection: ConnectionData, fromElement: HTMLElement, toElement: HTMLElement): SVGLineElement {
    const canvasRect = this.canvas.getBoundingClientRect();
    const fromRect = fromElement.getBoundingClientRect();
    const toRect = toElement.getBoundingClientRect();

    const fromX = fromRect.right - canvasRect.left;
    const fromY = (fromRect.top + fromRect.bottom) / 2 - canvasRect.top;
    const toX = toRect.left - canvasRect.left;
    const toY = (toRect.top + toRect.bottom) / 2 - canvasRect.top;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(fromX));
    line.setAttribute('y1', String(fromY));
    line.setAttribute('x2', String(toX));
    line.setAttribute('y2', String(toY));
    line.setAttribute('class', 'connection-line');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    line.dataset.connectionId = connection.id;
    line.dataset.fromId = connection.fromId;
    line.dataset.toId = connection.toId;

    return line;
  }

  /**
   * Snap coordinate to grid
   */
  private snapToGrid(value: number): number {
    const gridSize = this.gridSize ?? 16;
    return Math.round(value / gridSize) * gridSize;
  }
}