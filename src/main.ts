/**
 * Main application entry point
 * Initializes the visual programming framework with comprehensive error handling
 */

import { Editor, type EditorOptions } from "./ui/editor.js";
import {
  ViewToggle,
  createViewToggle,
  addViewTransitionStyles,
} from "./ui/viewToggle.js";
import { BlockRegistry } from "./core/registry.js";
import type { ElementData, ConnectionData } from "./core/renderer.js";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

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

interface AppOptions {
  readonly enableAutoSave?: boolean;
  readonly autoSaveInterval?: number;
  readonly enableMinimap?: boolean;
  readonly enableUndoRedo?: boolean;
  readonly maxUndoSteps?: number;
  readonly enableKeyboardShortcuts?: boolean;
  readonly enableExample?: boolean;
  readonly persistViewMode?: boolean;
}

interface AppState {
  readonly isInitialized: boolean;
  readonly hasError: boolean;
  readonly errorMessage?: string;
  readonly startTime: number;
  readonly features: string[];
}

interface UndoRedoState {
  readonly undoStack: string[];
  readonly redoStack: string[];
  readonly maxStackSize: number;
}

// ---------------------------------------------------------------------------
// Validation Functions
// ---------------------------------------------------------------------------

/**
 * Validates required DOM element
 */
function validateRequiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required element not found: ${id}`);
  }
  if (!element.isConnected) {
    throw new Error(`Required element not attached to DOM: ${id}`);
  }
  return element;
}

/**
 * Validates required SVG element
 */
function validateRequiredSVGElement(id: string): SVGElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required SVG element not found: ${id}`);
  }
  if (!(element instanceof SVGElement)) {
    throw new Error(`Element with id "${id}" is not an SVG element`);
  }
  if (!element.isConnected) {
    throw new Error(`Required SVG element not attached to DOM: ${id}`);
  }
  return element;
}

/**
 * Validates application options
 */
function validateAppOptions(options: AppOptions): void {
  if (options.autoSaveInterval !== undefined) {
    if (
      typeof options.autoSaveInterval !== "number" ||
      options.autoSaveInterval < 1000
    ) {
      throw new RangeError("Auto save interval must be at least 1000ms");
    }
  }

  if (options.maxUndoSteps !== undefined) {
    if (
      typeof options.maxUndoSteps !== "number" ||
      options.maxUndoSteps < 1 ||
      options.maxUndoSteps > 1000
    ) {
      throw new RangeError("Max undo steps must be between 1 and 1000");
    }
  }
}

/**
 * Validates state object for save/load operations
 */
function validateStateFormat(
  state: unknown
): asserts state is { elements: ElementData[]; connections: ConnectionData[] } {
  if (!state || typeof state !== "object") {
    throw new TypeError("State must be an object");
  }

  const stateObj = state as Record<string, unknown>;

  if (!Array.isArray(stateObj.elements)) {
    throw new TypeError("State must contain elements array");
  }

  if (!Array.isArray(stateObj.connections)) {
    throw new TypeError("State must contain connections array");
  }

  // Validate elements structure
  for (const [index, element] of stateObj.elements.entries()) {
    if (!element || typeof element !== "object") {
      throw new TypeError(`Invalid element at index ${index}`);
    }

    const el = element as Record<string, unknown>;
    if (
      !el.id ||
      !el.type ||
      typeof el.x !== "number" ||
      typeof el.y !== "number"
    ) {
      throw new TypeError(`Invalid element structure at index ${index}`);
    }
    if (!el.props || typeof el.props !== "object") {
      throw new TypeError(`Invalid element props at index ${index}`);
    }
  }

  // Validate connections structure
  for (const [index, connection] of stateObj.connections.entries()) {
    if (!connection || typeof connection !== "object") {
      throw new TypeError(`Invalid connection at index ${index}`);
    }

    const conn = connection as Record<string, unknown>;
    if (!conn.id || !conn.fromId || !conn.toId) {
      throw new TypeError(`Invalid connection structure at index ${index}`);
    }
  }
}

/**
 * Sanitizes filename for downloads
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 100);
}

// ---------------------------------------------------------------------------
// Visual Programming App Implementation
// ---------------------------------------------------------------------------

/**
 * Main application class that orchestrates all components
 * with comprehensive error handling and resource management
 */
class VisualProgrammingApp {
  private readonly elements: AppElements;
  private readonly editor: Editor;
  private readonly viewToggle: ViewToggle;
  private readonly options: Required<AppOptions>;
  private readonly state: AppState;
  private readonly undoRedoState: UndoRedoState;

  private autoSaveTimer?: number;
  private eventAbortController?: AbortController;
  private isDisposed = false;

  /**
   * Creates a new VisualProgrammingApp instance
   * @param options - Application configuration options
   * @throws {Error} If initialization fails
   */
  constructor(options: AppOptions = {}) {
    // Initialize state FIRST before anything that might throw
    this.state = {
      isInitialized: false,
      hasError: false,
      startTime: Date.now(),
      features: [],
    } as AppState;

    this.undoRedoState = {
      undoStack: [],
      redoStack: [],
      maxStackSize: 50, // default, will be updated from options
    } as UndoRedoState;

    try {
      validateAppOptions(options);

      this.options = {
        enableAutoSave: true,
        autoSaveInterval: 30000,
        enableMinimap: true,
        enableUndoRedo: true,
        maxUndoSteps: 50,
        enableKeyboardShortcuts: true,
        enableExample: true,
        persistViewMode: true,
        ...options,
      };

      // Update maxStackSize from options
      (this.undoRedoState as any).maxStackSize = this.options.maxUndoSteps;

      // Get and validate DOM elements
      this.elements = this.getDOMElements();

      // Initialize view toggle first
      this.viewToggle = this.initializeViewToggle();

      // Initialize editor
      this.editor = this.initializeEditor();

      // Setup all features
      this.setupEventListeners();
      this.setupFeatures();

      // Mark as initialized
      (this.state as any).isInitialized = true;

      console.log("Visual Programming Framework initialized successfully");
      console.log("Available block types:", BlockRegistry.getTypes());
      console.log("Enabled features:", this.state.features);
    } catch (error) {
      (this.state as any).hasError = true;
      (this.state as any).errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(
        "Failed to initialize Visual Programming Framework:",
        error
      );
      this.showErrorUI(error);
      throw error;
    }
  }

  /**
   * Get application statistics
   */
  getStats(): Readonly<{
    appState: AppState;
    editorStats: ReturnType<Editor["getStats"]>;
    viewToggleStats: ReturnType<ViewToggle["getStats"]>;
    undoRedoStats: { undoAvailable: number; redoAvailable: number };
    registryStats: ReturnType<typeof BlockRegistry.getStats>;
  }> {
    this.checkDisposed();

    return Object.freeze({
      appState: { ...this.state },
      editorStats: this.editor.getStats(),
      viewToggleStats: this.viewToggle.getStats(),
      undoRedoStats: {
        undoAvailable: this.undoRedoState.undoStack.length,
        redoAvailable: this.undoRedoState.redoStack.length,
      },
      registryStats: BlockRegistry.getStats(),
    });
  }

  /**
   * Dispose of application resources
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    try {
      // Clear timers
      if (this.autoSaveTimer) {
        clearInterval(this.autoSaveTimer);
      }

      // Abort event listeners
      if (this.eventAbortController) {
        this.eventAbortController.abort();
      }

      // Dispose components
      this.editor?.dispose();
      this.viewToggle?.dispose();

      this.isDisposed = true;
      console.log("Visual Programming Framework disposed");
    } catch (error) {
      console.error("Error during app disposal:", error);
    }
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Check if app is disposed
   */
  private checkDisposed(): void {
    if (this.isDisposed) {
      throw new Error("Application has been disposed");
    }
  }

  /**
   * Get and validate all required DOM elements
   */
  private getDOMElements(): AppElements {
    try {
      return {
        canvas: validateRequiredElement("canvas"),
        connectionsSvg: validateRequiredSVGElement("connectionsSvg"),
        toolbar:
          (document.querySelector(".toolbar") as HTMLElement) ||
          validateRequiredElement("toolbar"),
        statusElement: validateRequiredElement("status"),
        runButton: validateRequiredElement("runCode"),
        saveButton: validateRequiredElement("saveCode"),
        loadButton: validateRequiredElement("loadCode"),
        toggleViewButton: validateRequiredElement("toggleView"),
        connectModeButton: validateRequiredElement("connectMode"),
        clearAllButton: validateRequiredElement("clearAll"),
        elementCountElement: validateRequiredElement("elementCount"),
        connectionCountElement: validateRequiredElement("connectionCount"),
      };
    } catch (error) {
      throw new Error(
        `Failed to get required DOM elements: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Initialize view toggle with error handling
   */
  private initializeViewToggle(): ViewToggle {
    try {
      addViewTransitionStyles();

      const viewToggle = createViewToggle({
        persistState: this.options.persistViewMode,
        onViewChange: (mode) => {
          console.log(`Switched to ${mode} view`);
          this.updateStatus(`Switched to ${mode} view`, "success");
        },
      });

      // Bind toggle button
      viewToggle.bindButton(this.elements.toggleViewButton, {
        cardText: "Card View",
        iconText: "Icon View",
        cardIcon: "🎛",
        iconIcon: "📱",
      });

      this.state.features.push("View Toggle");
      return viewToggle;
    } catch (error) {
      throw new Error(
        `Failed to initialize view toggle: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Initialize editor with comprehensive options
   */
  private initializeEditor(): Editor {
    try {
      const editorOptions: EditorOptions = {
        canvas: this.elements.canvas,
        connectionsSvg: this.elements.connectionsSvg,
        snapToGrid: true,
        gridSize: 16,
        maxElements: 1000,
        maxConnections: 2000,
        enableKeyboardShortcuts: this.options.enableKeyboardShortcuts,
        enableAutoSave: this.options.enableAutoSave,
        autoSaveInterval: this.options.autoSaveInterval,
        onElementAdded: () => {
          this.updateStats();
          this.saveUndoState();
        },
        onElementRemoved: () => {
          this.updateStats();
          this.saveUndoState();
        },
        onConnectionAdded: () => {
          this.updateStats();
          this.saveUndoState();
        },
        onConnectionRemoved: () => {
          this.updateStats();
          this.saveUndoState();
        },
        onStatusUpdate: (message, type) => this.updateStatus(message, type),
        onCanvasChanged: () => this.saveUndoState(),
      };

      const editor = new Editor(editorOptions);
      this.state.features.push("Visual Editor");
      return editor;
    } catch (error) {
      throw new Error(
        `Failed to initialize editor: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Setup event listeners with proper cleanup
   */
  private setupEventListeners(): void {
    this.eventAbortController = new AbortController();
    const signal = this.eventAbortController.signal;

    try {
      // Toolbar - add elements
      this.elements.toolbar.addEventListener(
        "click",
        (e) => {
          const tool = (e.target as Element).closest(".tool") as HTMLElement;
          if (!tool?.dataset.type) return;

          try {
            this.editor.addElement(tool.dataset.type);
          } catch (error) {
            this.updateStatus(
              `Failed to add element: ${
                error instanceof Error ? error.message : String(error)
              }`,
              "error"
            );
          }
        },
        { signal }
      );

      // Control buttons
      this.elements.runButton.addEventListener(
        "click",
        () => {
          this.executeProgram();
        },
        { signal }
      );

      this.elements.saveButton.addEventListener(
        "click",
        () => {
          this.saveProgram();
        },
        { signal }
      );

      this.elements.loadButton.addEventListener(
        "click",
        () => {
          this.loadProgram();
        },
        { signal }
      );

      this.elements.connectModeButton.addEventListener(
        "click",
        () => {
          this.editor.toggleConnectMode();
          this.elements.connectModeButton.classList.toggle("active");
        },
        { signal }
      );

      this.elements.clearAllButton.addEventListener(
        "click",
        () => {
          if (confirm("Are you sure you want to clear everything?")) {
            this.editor.clearAll();
            this.elements.connectModeButton.classList.remove("active");
            this.clearUndoRedo();
          }
        },
        { signal }
      );

      // Add button event listener for togglePanel
      document.getElementById("togglePanel")?.addEventListener("click", () => {
        this.toggleControlPanel();
      }, { signal });

      // Toolbar toggle button
      const toolbarToggle = document.getElementById('toolbarToggle');
      if (toolbarToggle) {
        toolbarToggle.addEventListener('click', () => {
          this.toggleToolbar();
        }, { signal });
      }

      // Keyboard shortcuts
      document.addEventListener('keydown', this.handleKeyDown, { signal });
      if (this.options.enableKeyboardShortcuts) {
        this.state.features.push("Keyboard Shortcuts");
      }

      // Prevent context menu on canvas
      this.elements.canvas.addEventListener(
        "contextmenu",
        (e) => e.preventDefault(),
        { signal }
      );

      this.state.features.push("Event Handling");
    } catch (error) {
      throw new Error(
        `Failed to setup event listeners: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Setup additional features based on options
   */
  private setupFeatures(): void {
    try {
      if (this.options.enableUndoRedo) {
        this.setupUndoRedo();
        this.state.features.push("Undo/Redo");
      }

      if (this.options.enableMinimap) {
        this.setupMinimap();
        this.state.features.push("Minimap");
      }

      if (this.options.enableExample) {
        this.buildExampleProgram();
        this.state.features.push("Example Program");
      }

      this.updateStats();
    } catch (error) {
      console.warn("Some features failed to initialize:", error);
    }
  }

  /**
   * Toggle control panel visibility
   */
  private toggleControlPanel(): void {
    const controlPanel = document.querySelector('.control-panel') as HTMLElement;
    if (controlPanel) {
      const isHidden = controlPanel.style.display === 'none';
      controlPanel.style.display = isHidden ? 'block' : 'none';
      this.updateStatus(
        `Control panel ${isHidden ? 'shown' : 'hidden'} (Ctrl+P to toggle)`, 
        'success'
      );
    }
  }

  /**
   * Toggle toolbar visibility
   */
  private toggleToolbar(): void {
    const toolbar = document.querySelector('.toolbar') as HTMLElement;
    if (toolbar) {
      const isHidden = toolbar.classList.contains('hidden');
      toolbar.classList.toggle('hidden', !isHidden);
      this.updateStatus(
        `Toolbar ${isHidden ? 'shown' : 'hidden'} (Ctrl+Q to toggle)`, 
        'success'
      );
    }
  }

  /**
   * Handle keyboard shortcuts
   */
  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case "s":
          e.preventDefault();
          this.saveProgram();
          break;
        case "o":
          e.preventDefault();
          this.loadProgram();
          break;
        case "Enter":
          e.preventDefault();
          this.executeProgram();
          break;
        case "z":
          if (e.shiftKey) {
            e.preventDefault();
            this.redo();
          } else {
            e.preventDefault();
            this.undo();
          }
          break;
        case "y":
          e.preventDefault();
          this.redo();
          break;
        case "p":
          e.preventDefault();
          this.toggleControlPanel();
          break;
        case 't':
          e.preventDefault();
          this.toggleToolbar();
          break;
      }
    }
  };

  /**
   * Execute the visual program safely
   */
  private async executeProgram(): Promise<void> {
    try {
      this.elements.runButton.textContent = "⏸ Running...";
      (this.elements.runButton as HTMLButtonElement).disabled = true;

      await this.editor.executeProgram({
        stepDelay: 600,
        maxExecutionTime: 30000,
        maxSteps: 50,
      });
    } catch (error) {
      console.error("Execution error:", error);
      this.updateStatus(
        `Execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
    } finally {
      this.elements.runButton.textContent = "▶ Execute Code";
      (this.elements.runButton as HTMLButtonElement).disabled = false;
    }
  }

  /**
   * Save program safely with download and localStorage backup
   */
  private saveProgram(): void {
    try {
      const state = this.editor.getState();
      const timestamp = new Date().toISOString().split("T")[0];
      const filename = sanitizeFilename(`visual-program-${timestamp}.json`);

      // Save to localStorage as backup
      localStorage.setItem(
        "visual-programming-backup",
        JSON.stringify({
          ...state,
          savedAt: new Date().toISOString(),
          version: "1.0.0",
        })
      );

      // Download as file
      const blob = new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up blob URL
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      this.updateStatus(`Program saved as ${filename}`, "success");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.updateStatus(`Save failed: ${errorMessage}`, "error");
      console.error("Save error:", error);
    }
  }

  /**
   * Load program from file with validation
   */
  private loadProgram(): void {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.style.display = "none";

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
          if (file.size > 10 * 1024 * 1024) {
            // 10MB limit
            throw new Error("File too large (max 10MB)");
          }

          const text = await file.text();
          const state = JSON.parse(text);

          validateStateFormat(state);
          this.editor.loadState(state);
          this.updateStats();
          this.clearUndoRedo(); // Clear undo history after load

          this.updateStatus(`Loaded program from ${file.name}`, "success");
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.updateStatus(`Load failed: ${errorMessage}`, "error");
          console.error("Load error:", error);
        } finally {
          input.remove();
        }
      };

      input.onerror = () => {
        this.updateStatus("Failed to read file", "error");
        input.remove();
      };

      document.body.appendChild(input);
      input.click();
    } catch (error) {
      this.updateStatus(
        `Load failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
    }
  }

  /**
   * Update statistics display safely
   */
  private updateStats(): void {
    try {
      const stats = this.editor.getStats();
      this.elements.elementCountElement.textContent = String(
        stats.elementCount
      );
      this.elements.connectionCountElement.textContent = String(
        stats.connectionCount
      );
    } catch (error) {
      console.warn("Failed to update stats:", error);
    }
  }

  /**
   * Update status message safely
   */
  private updateStatus(
    message: string,
    type?: "success" | "error" | "running"
  ): void {
    try {
      this.elements.statusElement.textContent = message || "Ready";
      this.elements.statusElement.className = `status ${type || ""}`;

      // Auto-clear non-error messages
      if (type !== "error") {
        setTimeout(() => {
          if (this.elements.statusElement.textContent === message) {
            this.elements.statusElement.textContent = "Ready";
            this.elements.statusElement.className = "status";
          }
        }, 3000);
      }
    } catch (error) {
      console.warn("Failed to update status:", error);
    }
  }

  /**
   * Setup undo/redo functionality
   */
  private setupUndoRedo(): void {
    // Save initial state
    this.saveUndoState();
  }

  /**
   * Save current state to undo stack
   */
  private saveUndoState(): void {
    if (!this.options.enableUndoRedo) return;

    try {
      const state = JSON.stringify(this.editor.getState());

      // Don't save if state hasn't changed
      const lastState =
        this.undoRedoState.undoStack[this.undoRedoState.undoStack.length - 1];
      if (lastState === state) return;

      this.undoRedoState.undoStack.push(state);

      // Limit stack size
      if (
        this.undoRedoState.undoStack.length > this.undoRedoState.maxStackSize
      ) {
        this.undoRedoState.undoStack.shift();
      }

      // Clear redo stack on new action
      this.undoRedoState.redoStack.length = 0;
    } catch (error) {
      console.warn("Failed to save undo state:", error);
    }
  }

  /**
   * Undo last action
   */
  private undo(): void {
    if (this.undoRedoState.undoStack.length <= 1) return;

    try {
      const currentState = this.undoRedoState.undoStack.pop()!;
      this.undoRedoState.redoStack.push(currentState);

      const previousState =
        this.undoRedoState.undoStack[this.undoRedoState.undoStack.length - 1];
      const state = JSON.parse(previousState);

      this.editor.loadState(state);
      this.updateStats();
      this.updateStatus("Undid last action", "success");
    } catch (error) {
      this.updateStatus("Undo failed", "error");
      console.error("Undo error:", error);
    }
  }

  /**
   * Redo last undone action
   */
  private redo(): void {
    if (this.undoRedoState.redoStack.length === 0) return;

    try {
      const stateToRestore = this.undoRedoState.redoStack.pop()!;
      this.undoRedoState.undoStack.push(stateToRestore);

      const state = JSON.parse(stateToRestore);
      this.editor.loadState(state);
      this.updateStats();
      this.updateStatus("Redid last action", "success");
    } catch (error) {
      this.updateStatus("Redo failed", "error");
      console.error("Redo error:", error);
    }
  }

  /**
   * Clear undo/redo history
   */
  private clearUndoRedo(): void {
    this.undoRedoState.undoStack.length = 0;
    this.undoRedoState.redoStack.length = 0;
    this.saveUndoState(); // Save current as initial state
  }

  /**
   * Setup minimap functionality
   */
  private setupMinimap(): void {
    try {
      const minimapContainer = document.createElement("div");
      minimapContainer.className = "minimap-container";
      minimapContainer.innerHTML = `
        <div class="minimap-header">
          <span>Program Overview</span>
          <button class="minimap-toggle" aria-label="Toggle minimap">📍</button>
        </div>
        <canvas class="minimap-canvas" width="200" height="150"></canvas>
      `;

      // Add minimap styles
      this.addMinimapStyles();
      document.body.appendChild(minimapContainer);

      const canvas = minimapContainer.querySelector(
        ".minimap-canvas"
      ) as HTMLCanvasElement;
      const ctx = canvas.getContext("2d");
      const toggleBtn = minimapContainer.querySelector(
        ".minimap-toggle"
      ) as HTMLButtonElement;

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      let isCollapsed = false;

      toggleBtn.addEventListener("click", () => {
        isCollapsed = !isCollapsed;
        minimapContainer.classList.toggle("collapsed", isCollapsed);
        toggleBtn.textContent = isCollapsed ? "📍" : "📌";
        toggleBtn.setAttribute(
          "aria-label",
          isCollapsed ? "Show minimap" : "Hide minimap"
        );
      });

      // Update minimap periodically
      const updateMinimap = () => {
        if (isCollapsed || this.isDisposed) return;

        try {
          this.drawMinimap(ctx, canvas);
        } catch (error) {
          console.warn("Minimap update failed:", error);
        }
      };

      // Update every 500ms
      setInterval(updateMinimap, 500);

      // Initial update
      setTimeout(updateMinimap, 1000);
    } catch (error) {
      console.warn("Failed to setup minimap:", error);
    }
  }

  /**
   * Draw minimap content
   */
  private drawMinimap(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement
  ): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = "rgba(10, 10, 15, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const state = this.editor.getState();
    if (state.elements.length === 0) return;

    // Calculate bounds
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const el of state.elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + 140);
      maxY = Math.max(maxY, el.y + 64);
    }

    const scale = Math.min(
      (canvas.width - 20) / (maxX - minX || 1),
      (canvas.height - 20) / (maxY - minY || 1)
    );

    // Draw connections
    ctx.strokeStyle = "rgba(0, 212, 255, 0.6)";
    ctx.lineWidth = 1;
    for (const conn of state.connections) {
      const fromEl = state.elements.find((el) => el.id === conn.fromId);
      const toEl = state.elements.find((el) => el.id === conn.toId);

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
    }

    // Draw elements
    const typeColors: Record<string, string> = {
      variable: "rgba(239, 68, 68, 0.8)",
      array: "rgba(139, 92, 246, 0.8)",
      function: "rgba(245, 158, 11, 0.8)",
      loop: "rgba(16, 185, 129, 0.8)",
      counter: "rgba(0, 212, 255, 0.8)",
      return: "rgba(236, 72, 153, 0.8)",
    };

    for (const el of state.elements) {
      const x = (el.x - minX) * scale + 10;
      const y = (el.y - minY) * scale + 10;
      const w = Math.max(2, 140 * scale);
      const h = Math.max(2, 64 * scale);

      ctx.fillStyle = typeColors[el.type] || "rgba(255, 255, 255, 0.3)";
      ctx.fillRect(x, y, w, h);

      // Add border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, w, h);
    }
  }

  /**
   * Add minimap styles
   */
  private addMinimapStyles(): void {
    const styleId = "minimap-styles";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .minimap-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 220px;
        background: var(--bg-card, rgba(15, 15, 25, 0.9));
        border: 1px solid var(--border-glass, rgba(255, 255, 255, 0.1));
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
        color: var(--text-secondary, #a1a1aa);
        border-bottom: 1px solid var(--border-glass, rgba(255, 255, 255, 0.1));
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .minimap-toggle {
        background: none;
        border: none;
        color: var(--text-secondary, #a1a1aa);
        cursor: pointer;
        font-size: 12px;
        padding: 2px;
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
  }

  /**
   * Build example program safely
   */
  private buildExampleProgram(): void {
    try {
      // Create example elements with error handling
      const arrayId = this.editor.addElement("array", 150, 200, {
        name: "numbers",
        items: [1, 2, 3, 4, 5],
      });

      const functionId = this.editor.addElement("function", 350, 180, {
        name: "getLength",
        params: "arr",
      });

      const loopId = this.editor.addElement("loop", 550, 200);

      const counterId = this.editor.addElement("counter", 750, 160, {
        value: 0,
      });

      const printId = this.editor.addElement("print", 550, 280, {
        message: "Processing item...",
      });

      // Create connections with delay to ensure DOM readiness
      setTimeout(() => {
        try {
          this.editor.createConnection(arrayId, functionId);
          this.editor.createConnection(functionId, loopId);
          this.editor.createConnection(loopId, counterId);
          this.editor.createConnection(loopId, printId);

          this.updateStats();
          this.saveUndoState(); // Save example as initial state
          this.updateStatus(
            "Example program loaded - try executing it!",
            "success"
          );
        } catch (error) {
          console.warn("Failed to create example connections:", error);
        }
      }, 100);
    } catch (error) {
      console.warn("Failed to build example program:", error);
    }
  }

  /**
   * Show error UI when initialization fails
   */
  private showErrorUI(error: unknown): void {
    try {
      const errorDiv = document.createElement("div");
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
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      `;

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errorDiv.innerHTML = `
        <h3>⚠️ Initialization Error</h3>
        <p>Failed to start the Visual Programming Framework.</p>
        <details style="margin-top: 10px; text-align: left;">
          <summary style="cursor: pointer;">Error Details</summary>
          <pre style="font-size: 12px; margin-top: 5px; white-space: pre-wrap;">${errorMessage}</pre>
        </details>
        <p style="font-size: 12px; margin-top: 10px; opacity: 0.8;">
          Check the browser console for more details.
        </p>
      `;

      document.body.appendChild(errorDiv);

      // Remove error after 10 seconds
      setTimeout(() => {
        try {
          errorDiv.remove();
        } catch {}
      }, 10000);
    } catch {
      // Fallback: just log to console if DOM manipulation fails
      console.error("Critical initialization error:", error);
    }
  }
}

// ---------------------------------------------------------------------------
// Application Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize application when DOM is ready
 */
function initializeApp(): void {
  try {
    const app = new VisualProgrammingApp({
      enableAutoSave: true,
      enableMinimap: true,
      enableUndoRedo: true,
      enableKeyboardShortcuts: true,
      enableExample: true,
      persistViewMode: true,
    });

    // Expose for debugging
    if (typeof window !== "undefined") {
      // @ts-ignore - Augment window for debugging
      window.VisualProgrammingApp = VisualProgrammingApp;
      // @ts-ignore
      window.BlockRegistry = BlockRegistry;
      // @ts-ignore
      window.app = app;
    }

    console.log("🚀 Visual Programming Framework fully initialized");
    console.log("📊 Available features:");
    console.log("  ✅ Auto-save every 30 seconds");
    console.log("  ✅ Minimap in bottom-right corner");
    console.log("  ✅ Undo/Redo with Ctrl+Z/Ctrl+Y");
    console.log(
      "  ✅ Keyboard shortcuts: Ctrl+S (save), Ctrl+O (load), Ctrl+Enter (run)"
    );
    console.log("  ✅ View toggle between card/icon modes");
    console.log("  ✅ Example program with sample blocks");
    console.log("🔧 Access via window.app for debugging");
  } catch (error) {
    console.error("❌ Failed to initialize application:", error);
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}

// Global exports for development
if (typeof window !== "undefined") {
  // @ts-ignore
  window.VisualProgrammingApp = VisualProgrammingApp;
  // @ts-ignore
  window.BlockRegistry = BlockRegistry;
}

export { VisualProgrammingApp, BlockRegistry };
