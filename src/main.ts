/**
 * Main application entry point
 * Initializes the visual programming framework
 */

import { Editor, type EditorOptions } from './ui/editor.js';
import { ViewToggle, createViewToggleButton, addViewTransitionStyles } from './ui/viewToggle.js';
import { BlockRegistry } from './core/registry.js';

interface AppElements {
  readonly canvas: HTMLElement;
  readonly connectionsSvg: SVGElement;
  readonly toolbar: HTMLElement;
  readonly statusElement: HTMLElement;
  readonly runButton: HTMLElement;
  readonly saveButton: HTMLElement;
  readonly loadButton: HTMLElement;
  readonly toggleViewButton: HTMLElement;
  readonly connectModeButton: HTMLElement;
  readonly clearAllButton: HTMLElement;
  readonly elementCountElement: HTMLElement;
  readonly connectionCountElement: HTMLElement;
}

class VisualProgrammingApp {
  private readonly elements: AppElements;
  private readonly editor: Editor;
  private readonly viewToggle: ViewToggle;

  constructor() {
    // Get DOM elements
    this.elements = this.getDOMElements();
    
    // Initialize view toggle
    this.viewToggle = new ViewToggle({
      onViewChange: (mode) => {
        console.log(`Switched to ${mode} view`);
        this.updateStatus(`Switched to ${mode} view`, 'success');
      }
    });

    // Initialize editor
    this.editor = new Editor({
      canvas: this.elements.canvas,
      connectionsSvg: this.elements.connectionsSvg,
      snapToGrid: true,
      gridSize: 16,
      onElementAdded: () => this.updateStats(),
      onElementRemoved: () => this.updateStats(),
      onConnectionAdded: () => this.updateStats(),
      onConnectionRemoved: () => this.updateStats(),
      onStatusUpdate: (message, type) => this.updateStatus(message, type)
    });

    this.setupEventListeners();
    this.setupViewToggle();
    this.buildExampleProgram();
    this.updateStats();

    // Add transition styles
    addViewTransitionStyles();
    
    console.log('Visual Programming Framework initialized');
    console.log('Available block types:', BlockRegistry.getTypes());
  }

  /**
   * Get all required DOM elements
   */
  private getDOMElements(): AppElements {
    const getElement = (id: string): HTMLElement => {
      const element = document.getElementById(id);
      if (!element) {
        throw new Error(`Required element not found: ${id}`);
      }
      return element;
    };

    const getSVGElement = (id: string): SVGElement => {
      const element = document.getElementById(id) as SVGElement;
      if (!element) {
        throw new Error(`Required SVG element not found: ${id}`);
      }
      return element;
    };

    return {
      canvas: getElement('canvas'),
      connectionsSvg: getSVGElement('connectionsSvg'),
      toolbar: document.querySelector('.toolbar') as HTMLElement,
      statusElement: getElement('status'),
      runButton: getElement('runCode'),
      saveButton: getElement('saveCode'),
      loadButton: getElement('loadCode'),
      toggleViewButton: getElement('toggleView'),
      connectModeButton: getElement('connectMode'),
      clearAllButton: getElement('clearAll'),
      elementCountElement: getElement('elementCount'),
      connectionCountElement: getElement('connectionCount')
    };
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Toolbar - add elements
    this.elements.toolbar.addEventListener('click', (e) => {
      const tool = (e.target as Element).closest('.tool') as HTMLElement;
      if (!tool || !tool.dataset.type) return;

      this.editor.addElement(tool.dataset.type);
    });

    // Run button
    this.elements.runButton.addEventListener('click', () => {
      this.executeProgram();
    });

    // Save button
    this.elements.saveButton.addEventListener('click', () => {
      this.saveProgram();
    });

    // Load button
    this.elements.loadButton.addEventListener('click', () => {
      this.loadProgram();
    });

    // Connect mode button
    this.elements.connectModeButton.addEventListener('click', () => {
      this.editor.toggleConnectMode();
      this.elements.connectModeButton.classList.toggle('active');
    });

    // Clear all button
    this.elements.clearAllButton.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear everything?')) {
        this.editor.clearAll();
        this.elements.connectModeButton.classList.remove('active');
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            this.saveProgram();
            break;
          case 'o':
            e.preventDefault();
            this.loadProgram();
            break;
          case 'Enter':
            e.preventDefault();
            this.executeProgram();
            break;
        }
      }
    });
  }

  /**
   * Setup view toggle functionality
   */
  private setupViewToggle(): void {
    createViewToggleButton(this.elements.toggleViewButton, this.viewToggle, {
      cardText: 'Card View',
      iconText: 'Icon View',
      cardIcon: '🎛',
      iconIcon: '📱'
    });
  }

  /**
   * Execute the visual program
   */
  private async executeProgram(): Promise<void> {
    try {
      this.elements.runButton.textContent = '⏸ Running...';
      (this.elements.runButton as HTMLButtonElement).disabled = true;
      
      await this.editor.executeProgram({
        stepDelay: 600,
        maxExecutionTime: 30000,
        maxSteps: 50
      });
      
    } catch (error) {
      console.error('Execution error:', error);
    } finally {
      this.elements.runButton.textContent = '▶ Execute Code';
      (this.elements.runButton as HTMLButtonElement).disabled = false;
    }
  }

  /**
   * Save program to localStorage and download
   */
  private saveProgram(): void {
    try {
      const state = this.editor.getState();
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `visual-program-${timestamp}.json`;
      
      // Save to localStorage
      localStorage.setItem('visual-programming-autosave', JSON.stringify(state));
      
      // Download as file
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.updateStatus(`Program saved as ${filename}`, 'success');
      
    } catch (error) {
      this.updateStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  /**
   * Load program from file or localStorage
   */
  private loadProgram(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const state = JSON.parse(text);
        
        this.validateStateFormat(state);
        this.editor.loadState(state);
        this.updateStats();
        
        this.updateStatus(`Loaded program from ${file.name}`, 'success');
        
      } catch (error) {
        this.updateStatus(`Load failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    };
    
    input.click();
  }

  /**
   * Validate loaded state format
   */
  private validateStateFormat(state: unknown): void {
    if (!state || typeof state !== 'object') {
      throw new Error('Invalid file format');
    }
    
    const stateObj = state as Record<string, unknown>;
    
    if (!Array.isArray(stateObj.elements) || !Array.isArray(stateObj.connections)) {
      throw new Error('Missing required arrays: elements, connections');
    }
    
    // Validate elements
    stateObj.elements.forEach((element: unknown, index: number) => {
      if (!element || typeof element !== 'object') {
        throw new Error(`Invalid element at index ${index}`);
      }
      
      const el = element as Record<string, unknown>;
      if (!el.id || !el.type || typeof el.x !== 'number' || typeof el.y !== 'number') {
        throw new Error(`Invalid element structure at index ${index}`);
      }
    });
    
    // Validate connections
    stateObj.connections.forEach((connection: unknown, index: number) => {
      if (!connection || typeof connection !== 'object') {
        throw new Error(`Invalid connection at index ${index}`);
      }
      
      const conn = connection as Record<string, unknown>;
      if (!conn.id || !conn.fromId || !conn.toId) {
        throw new Error(`Invalid connection structure at index ${index}`);
      }
    });
  }

  /**
   * Update statistics display
   */
  private updateStats(): void {
    const stats = this.editor.getStats();
    this.elements.elementCountElement.textContent = String(stats.elementCount);
    this.elements.connectionCountElement.textContent = String(stats.connectionCount);
  }

  /**
   * Update status message
   */
  private updateStatus(message: string, type?: 'success' | 'error' | 'running'): void {
    this.elements.statusElement.textContent = message;
    this.elements.statusElement.className = `status ${type || ''}`;
    
    // Auto-clear status after 3 seconds for non-error messages
    if (type !== 'error') {
      setTimeout(() => {
        if (this.elements.statusElement.textContent === message) {
          this.elements.statusElement.textContent = 'Ready';
          this.elements.statusElement.className = 'status';
        }
      }, 3000);
    }
  }

  /**
   * Build an example program to demonstrate functionality
   */
  private buildExampleProgram(): void {
    try {
      // Create example elements
      const arrayId = this.editor.addElement('array', 150, 200, {
        name: 'numbers',
        items: [1, 2, 3, 4, 5]
      });
      
      const functionId = this.editor.addElement('function', 350, 180, {
        name: 'getLength',
        params: 'arr'
      });
      
      const loopId = this.editor.addElement('loop', 550, 200);
      
      const counterId = this.editor.addElement('counter', 750, 160, {
        value: 0
      });
      
      const printId = this.editor.addElement('print', 550, 280, {
        message: 'Processing item...'
      });
      
      const returnId = this.editor.addElement('return', 750, 240, {
        value: 'count'
      });

      // Create connections with a small delay to ensure DOM elements are ready
      setTimeout(() => {
        this.editor.createConnection(arrayId, functionId);
        this.editor.createConnection(functionId, loopId);
        this.editor.createConnection(loopId, counterId);
        this.editor.createConnection(loopId, printId);
        this.editor.createConnection(counterId, returnId);
        
        this.updateStats();
        this.updateStatus('Example program loaded - try executing it!', 'success');
      }, 100);
      
    } catch (error) {
      console.warn('Failed to build example program:', error);
    }
  }

  /**
   * Auto-save functionality
   */
  private setupAutoSave(): void {
    let autoSaveTimeout: number;
    
    const scheduleAutoSave = () => {
      clearTimeout(autoSaveTimeout);
      autoSaveTimeout = window.setTimeout(() => {
        try {
          const state = this.editor.getState();
          localStorage.setItem('visual-programming-autosave', JSON.stringify(state));
          console.log('Auto-saved program state');
        } catch (error) {
          console.warn('Auto-save failed:', error);
        }
      }, 2000);
    };

    // Auto-save on changes
    const originalOnElementAdded = this.editor['options'].onElementAdded;
    const originalOnElementRemoved = this.editor['options'].onElementRemoved;
    const originalOnConnectionAdded = this.editor['options'].onConnectionAdded;
    const originalOnConnectionRemoved = this.editor['options'].onConnectionRemoved;

    this.editor['options'].onElementAdded = (element) => {
      originalOnElementAdded?.(element);
      scheduleAutoSave();
    };

    this.editor['options'].onElementRemoved = (elementId) => {
      originalOnElementRemoved?.(elementId);
      scheduleAutoSave();
    };

    this.editor['options'].onConnectionAdded = (connection) => {
      originalOnConnectionAdded?.(connection);
      scheduleAutoSave();
    };

    this.editor['options'].onConnectionRemoved = (connectionId) => {
      originalOnConnectionRemoved?.(connectionId);
      scheduleAutoSave();
    };

    // Load auto-saved state on startup
    try {
      const saved = localStorage.getItem('visual-programming-autosave');
      if (saved) {
        const state = JSON.parse(saved);
        this.validateStateFormat(state);
        // Don't auto-load if there's already example content
        if (this.editor.getStats().elementCount === 0) {
          this.editor.loadState(state);
          this.updateStats();
          this.updateStatus('Restored auto-saved program', 'success');
        }
      }
    } catch (error) {
      console.warn('Failed to load auto-saved state:', error);
    }
  }

  /**
   * Setup minimap functionality
   */
  private setupMinimap(): void {
    const minimapContainer = document.createElement('div');
    minimapContainer.className = 'minimap-container';
    minimapContainer.innerHTML = `
      <div class="minimap-header">
        <span>Program Overview</span>
        <button class="minimap-toggle">📍</button>
      </div>
      <canvas class="minimap-canvas" width="200" height="150"></canvas>
    `;

    // Add minimap styles
    const style = document.createElement('style');
    style.textContent = `
      .minimap-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 220px;
        background: var(--bg-card);
        border: 1px solid var(--border-glass);
        border-radius: 8px;
        backdrop-filter: blur(20px);
        z-index: 200;
        opacity: 0.8;
        transition: opacity 0.3s ease;
      }
      
      .minimap-container:hover {
        opacity: 1;
      }
      
      .minimap-header {
        padding: 8px 12px;
        font-size: 11px;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--border-glass);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .minimap-toggle {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 12px;
      }
      
      .minimap-canvas {
        display: block;
        width: 100%;
        height: auto;
      }
      
      .minimap-container.collapsed .minimap-canvas {
        display: none;
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(minimapContainer);

    const canvas = minimapContainer.querySelector('.minimap-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const toggleBtn = minimapContainer.querySelector('.minimap-toggle') as HTMLButtonElement;

    let isCollapsed = false;

    toggleBtn.addEventListener('click', () => {
      isCollapsed = !isCollapsed;
      minimapContainer.classList.toggle('collapsed', isCollapsed);
      toggleBtn.textContent = isCollapsed ? '📍' : '📌';
    });

    // Update minimap periodically
    const updateMinimap = () => {
      if (isCollapsed) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw background
      ctx.fillStyle = 'rgba(10, 10, 15, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Get all elements
      const state = this.editor.getState();
      if (state.elements.length === 0) return;

      // Calculate bounds
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      state.elements.forEach(el => {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + 140);
        maxY = Math.max(maxY, el.y + 64);
      });

      const scale = Math.min(
        (canvas.width - 20) / (maxX - minX || 1),
        (canvas.height - 20) / (maxY - minY || 1)
      );

      // Draw connections
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.6)';
      ctx.lineWidth = 1;
      state.connections.forEach(conn => {
        const fromEl = state.elements.find(el => el.id === conn.fromId);
        const toEl = state.elements.find(el => el.id === conn.toId);
        
        if (fromEl && toEl) {
          const fromX = (fromEl.x - minX) * scale + 10;
          const fromY = (fromEl.y - minY) * scale + 10;
          const toX = (toEl.x - minX) * scale + 10;
          const toY = (toEl.y - minY) * scale + 10;
          
          ctx.beginPath();
          ctx.moveTo(fromX, fromY);
          ctx.lineTo(toX, toY);
          ctx.stroke();
        }
      });

      // Draw elements
      state.elements.forEach(el => {
        const x = (el.x - minX) * scale + 10;
        const y = (el.y - minY) * scale + 10;
        const w = 140 * scale;
        const h = 64 * scale;

        // Color based on type
        const colors: Record<string, string> = {
          variable: 'rgba(239, 68, 68, 0.8)',
          array: 'rgba(139, 92, 246, 0.8)',
          function: 'rgba(245, 158, 11, 0.8)',
          loop: 'rgba(16, 185, 129, 0.8)',
          counter: 'rgba(0, 212, 255, 0.8)',
          return: 'rgba(236, 72, 153, 0.8)'
        };

        ctx.fillStyle = colors[el.type] || 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(x, y, Math.max(2, w), Math.max(2, h));
        
        // Add border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, Math.max(2, w), Math.max(2, h));
      });
    };

    // Update minimap every 500ms
    setInterval(updateMinimap, 500);
    
    // Initial update
    setTimeout(updateMinimap, 1000);
  }

  /**
   * Setup undo/redo functionality
   */
  private setupUndoRedo(): void {
    const undoStack: string[] = [];
    const redoStack: string[] = [];
    const maxStackSize = 20;

    const saveState = () => {
      const state = JSON.stringify(this.editor.getState());
      undoStack.push(state);
      
      if (undoStack.length > maxStackSize) {
        undoStack.shift();
      }
      
      // Clear redo stack when new action is performed
      redoStack.length = 0;
      
      this.updateUndoRedoButtons();
    };

    const undo = () => {
      if (undoStack.length > 1) {
        const currentState = undoStack.pop()!;
        redoStack.push(currentState);
        
        const previousState = undoStack[undoStack.length - 1];
        this.editor.loadState(JSON.parse(previousState));
        this.updateStats();
        this.updateStatus('Undid last action', 'success');
        this.updateUndoRedoButtons();
      }
    };

    const redo = () => {
      if (redoStack.length > 0) {
        const stateToRestore = redoStack.pop()!;
        undoStack.push(stateToRestore);
        
        this.editor.loadState(JSON.parse(stateToRestore));
        this.updateStats();
        this.updateStatus('Redid last action', 'success');
        this.updateUndoRedoButtons();
      }
    };

    const updateUndoRedoButtons = () => {
      // Could add undo/redo buttons to UI here
    };

    // Save initial state
    saveState();

    // Listen for changes
    const originalOnElementAdded = this.editor['options'].onElementAdded;
    const originalOnElementRemoved = this.editor['options'].onElementRemoved;
    const originalOnConnectionAdded = this.editor['options'].onConnectionAdded;
    const originalOnConnectionRemoved = this.editor['options'].onConnectionRemoved;

    this.editor['options'].onElementAdded = (element) => {
      originalOnElementAdded?.(element);
      saveState();
    };

    this.editor['options'].onElementRemoved = (elementId) => {
      originalOnElementRemoved?.(elementId);
      saveState();
    };

    this.editor['options'].onConnectionAdded = (connection) => {
      originalOnConnectionAdded?.(connection);
      saveState();
    };

    this.editor['options'].onConnectionRemoved = (connectionId) => {
      originalOnConnectionRemoved?.(connectionId);
      saveState();
    };

    // Keyboard shortcuts for undo/redo
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        redo();
      }
    });

    // Store methods for external access
    this.updateUndoRedoButtons = updateUndoRedoButtons;
  }

  private updateUndoRedoButtons(): void {
    // Implementation for updating undo/redo button states
  }
}

// Initialize application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new VisualProgrammingApp();
  });
} else {
  new VisualProgrammingApp();
}

// Export for debugging and external use
declare global {
  interface Window {
    VisualProgrammingApp: typeof VisualProgrammingApp;
    BlockRegistry: typeof BlockRegistry;
    app?: VisualProgrammingApp;
  }
}

window.VisualProgrammingApp = VisualProgrammingApp;
window.BlockRegistry = BlockRegistry;

// Create and expose app instance
try {
  const app = new VisualProgrammingApp();
  window.app = app;
  
  // Setup additional features
  app.setupAutoSave();
  app.setupMinimap();
  app.setupUndoRedo();
  
  console.log('Visual Programming Framework fully initialized');
  console.log('Available features:');
  console.log('- Auto-save every 2 seconds');
  console.log('- Minimap in bottom-right corner');
  console.log('- Undo/Redo with Ctrl+Z/Ctrl+Y');
  console.log('- Keyboard shortcuts: Ctrl+S (save), Ctrl+O (load), Ctrl+Enter (run)');
  console.log('- Access via window.app for debugging');
  
} catch (error) {
  console.error('Failed to initialize Visual Programming Framework:', error);
  
  // Show error to user
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #dc2626;
    color: white;
    padding: 20px;
    border-radius: 8px;
    z-index: 10000;
    font-family: Inter, sans-serif;
    text-align: center;
    max-width: 400px;
  `;
  errorDiv.innerHTML = `
    <h3>Initialization Error</h3>
    <p>Failed to start the Visual Programming Framework.</p>
    <p style="font-size: 12px; margin-top: 10px; opacity: 0.8;">
      Check the browser console for details.
    </p>
  `;
  document.body.appendChild(errorDiv);
  
  // Remove error after 5 seconds
  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}
window.BlockRegistry = BlockRegistry;